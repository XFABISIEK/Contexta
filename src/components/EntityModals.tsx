import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { debounce, MEMORY_TYPES, PRIORITIES } from "../lib/utils";
import { Modal } from "./Modal";
import type { ComposerState, Memory, Project } from "../types";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(4000).default(""),
});

const memorySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().max(100000).default(""),
});

const ruleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().max(50000).default(""),
});

const skillSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(4000).default(""),
  content: z.string().max(100000).default(""),
  category: z.string().max(80).default("general"),
});

const personalSchema = z.object({
  key: z.string().trim().min(1, "Key is required").max(120),
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().max(50000).default(""),
});

function useProjectOptions() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    api.projects.list(undefined, 200, 0).then((p) => setProjects(p.items)).catch(() => {});
  }, []);
  return projects;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="field-err">{msg}</div>;
}

/* ---------------- Project ---------------- */

function ProjectModal({ composer, onDone }: { composer: ComposerState; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(!!composer.editId);

  useEffect(() => {
    if (!composer.editId) return;
    api.projects.get(composer.editId).then((p) => {
      if (p) {
        setName(p.name);
        setDescription(p.description);
      }
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [composer.editId]);

  const save = async () => {
    const parsed = projectSchema.safeParse({ name, description });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      if (composer.editId) {
        await api.projects.update(composer.editId, parsed.data.name, parsed.data.description);
        toast("success", "Project updated");
      } else {
        await api.projects.create(parsed.data.name, parsed.data.description);
        toast("success", "Project created");
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Modal
      open
      title={composer.editId ? "Edit Project" : "New Project"}
      onClose={onDone}
      footer={
        <>
          <button className="btn ghost" onClick={onDone}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={loading}>Save</button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Axiom" autoFocus />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
      </div>
      <FieldError msg={err} />
    </Modal>
  );
}

/* ---------------- Memory (autosave in edit mode) ---------------- */

type SaveState = "idle" | "saving" | "saved" | "error";

function MemoryModal({ composer, onDone }: { composer: ComposerState; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const projects = useProjectOptions();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [memoryType, setMemoryType] = useState("fact");
  const [priority, setPriority] = useState("normal");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("manual");
  const [err, setErr] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loaded, setLoaded] = useState(!composer.editId);
  const snapshot = useRef("");
  const isCreate = !composer.editId;

  useEffect(() => {
    if (!composer.editId) {
      if (composer.projectId) setProjectId(composer.projectId);
      return;
    }
    api.memories.get(composer.editId).then((m: Memory | null) => {
      if (m) {
        setTitle(m.title);
        setContent(m.content);
        setProjectId(m.project_id ?? "none");
        setMemoryType(m.memory_type);
        setPriority(m.priority);
        setTags(m.tags.map((t) => t.name).join(", "));
        setSource(m.source);
        snapshot.current = JSON.stringify([m.title, m.content, m.project_id, m.memory_type, m.priority]);
      }
    }).catch((e) => setErr(e.message)).finally(() => setLoaded(true));
  }, [composer.editId, composer.projectId]);

  const persist = useMemo(
    () =>
      debounce(async (id: string, data: { title: string; content: string; project_id: string | null; memory_type: string; priority: string; source: string; tags: string[] }) => {
        setSaveState("saving");
        try {
          await api.memories.update(id, data);
          setSaveState("saved");
          useApp.getState().refreshStats();
        } catch {
          setSaveState("error");
        }
      }, 700),
    [],
  );

  // Autosave on change (edit mode only, skips the initial load).
  useEffect(() => {
    if (isCreate || !loaded || !composer.editId) return;
    const key = JSON.stringify([title, content, projectId, memoryType, priority]);
    if (key === snapshot.current) return;
    if (!title.trim()) return;
    snapshot.current = key;
    persist(composer.editId, {
      title: title.trim(),
      content,
      project_id: projectId === "none" ? null : projectId,
      memory_type: memoryType,
      priority,
      source,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    return () => persist.cancel();
  }, [title, content, projectId, memoryType, priority, tags, source, isCreate, loaded, composer.editId, persist]);

  const create = async () => {
    const parsed = memorySchema.safeParse({ title, content });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await api.memories.create({
        title: parsed.data.title,
        content: parsed.data.content,
        project_id: projectId === "none" ? null : projectId,
        memory_type: memoryType,
        priority,
        source,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast("success", "Memory saved");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Modal
      open
      wide
      title={isCreate ? "New Memory" : "Edit Memory"}
      onClose={onDone}
      footer={
        isCreate ? (
          <>
            <button className="btn ghost" onClick={onDone}>Cancel</button>
            <button className="btn primary" onClick={create}>Save memory</button>
          </>
        ) : (
          <span className="save-state">
            {saveState === "saving" && <span className="saving">Saving…</span>}
            {saveState === "saved" && <span className="saved">Saved</span>}
            {saveState === "error" && <span className="error">Save error — retrying on next change</span>}
          </span>
        )
      }
    >
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should AI remember?" autoFocus />
      </div>
      <div className="field">
        <label>Content</label>
        <textarea className="input" style={{ minHeight: 150 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Details, decisions, context…" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="none">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Type</label>
          <select className="input" value={memoryType} onChange={(e) => setMemoryType(e.target.value)}>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Source</label>
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
        </div>
      </div>
      <div className="field">
        <label>Tags (comma separated)</label>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="auth, decision, architecture" />
      </div>
      <FieldError msg={err} />
    </Modal>
  );
}

/* ---------------- Rule ---------------- */

function RuleModal({ composer, onDone }: { composer: ComposerState; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const projects = useProjectOptions();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [priority, setPriority] = useState("normal");
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (composer.projectId) setProjectId(composer.projectId);
    if (!composer.editId) return;
    api.rules.list(null, 500, 0).then((p) => {
      const r = p.items.find((x) => x.id === composer.editId);
      if (r) {
        setTitle(r.title);
        setContent(r.content);
        setProjectId(r.project_id ?? "none");
        setPriority(r.priority);
        setEnabled(r.enabled);
      }
    }).catch((e) => setErr(e.message));
  }, [composer.editId, composer.projectId]);

  const save = async () => {
    const parsed = ruleSchema.safeParse({ title, content });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    const input = {
      project_id: projectId === "none" ? null : projectId,
      title: parsed.data.title,
      content: parsed.data.content,
      priority,
      enabled,
    };
    try {
      if (composer.editId) {
        await api.rules.update(composer.editId, input);
        toast("success", "Rule updated");
      } else {
        await api.rules.create(input);
        toast("success", "Rule created");
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Modal
      open
      title={composer.editId ? "Edit Rule" : "New Rule"}
      onClose={onDone}
      footer={
        <>
          <button className="btn ghost" onClick={onDone}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Always use strict TypeScript" autoFocus />
      </div>
      <div className="field">
        <label>Content</label>
        <textarea className="input" value={content} onChange={(e) => setContent(e.target.value)} placeholder="The rule AI must follow…" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="none">— global —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>
      <FieldError msg={err} />
    </Modal>
  );
}

/* ---------------- Skill ---------------- */

function SkillModal({ composer, onDone }: { composer: ComposerState; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!composer.editId) return;
    api.skills.list(null, null, 500, 0).then((p) => {
      const s = p.items.find((x) => x.id === composer.editId);
      if (s) {
        setName(s.name);
        setDescription(s.description);
        setContent(s.content);
        setCategory(s.category);
      }
    }).catch((e) => setErr(e.message));
  }, [composer.editId]);

  const save = async () => {
    const parsed = skillSchema.safeParse({ name, description, content, category });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      if (composer.editId) {
        await api.skills.update(composer.editId, parsed.data);
        toast("success", "Skill updated");
      } else {
        await api.skills.create(parsed.data);
        toast("success", "Skill created");
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Modal
      open
      wide
      title={composer.editId ? "Edit Skill" : "New Skill"}
      onClose={onDone}
      footer={
        <>
          <button className="btn ghost" onClick={onDone}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. tauri-ipc" autoFocus />
        </div>
        <div className="field">
          <label>Category</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general" />
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary for retrieval" />
      </div>
      <div className="field">
        <label>Content</label>
        <textarea className="input" style={{ minHeight: 140 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Full skill content, patterns, examples…" />
      </div>
      <FieldError msg={err} />
    </Modal>
  );
}

/* ---------------- Personal ---------------- */

function PersonalModal({ composer, onDone }: { composer: ComposerState; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!composer.editId) return;
    api.personal.list().then((items) => {
      const p = items.find((x) => x.id === composer.editId);
      if (p) {
        setKey(p.key);
        setTitle(p.title);
        setContent(p.content);
      }
    }).catch((e) => setErr(e.message));
  }, [composer.editId]);

  const save = async () => {
    const parsed = personalSchema.safeParse({ key, title, content });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      if (composer.editId) {
        await api.personal.update(composer.editId, parsed.data);
        toast("success", "Entry updated");
      } else {
        await api.personal.create(parsed.data);
        toast("success", "Entry created");
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Modal
      open
      title={composer.editId ? "Edit Entry" : "New Personal Entry"}
      onClose={onDone}
      footer={
        <>
          <button className="btn ghost" onClick={onDone}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>Key</label>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. timezone" autoFocus />
        </div>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Timezone" />
        </div>
      </div>
      <div className="field">
        <label>Content</label>
        <textarea className="input" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Stored locally, never leaves this machine." />
      </div>
      <FieldError msg={err} />
    </Modal>
  );
}

/* ---------------- switch + delete confirm ---------------- */

export function EntityModals() {
  const composer = useApp((s) => s.composer);
  const setComposer = useApp((s) => s.setComposer);
  const refreshStats = useApp((s) => s.refreshStats);

  if (!composer) return null;
  const onDone = () => {
    setComposer(null);
    refreshStats();
    // Notify list pages to reload via a lightweight event.
    window.dispatchEvent(new CustomEvent("simplememory:changed"));
  };

  switch (composer.kind) {
    case "project":
      return <ProjectModal composer={composer} onDone={onDone} />;
    case "memory":
      return <MemoryModal composer={composer} onDone={onDone} />;
    case "rule":
      return <RuleModal composer={composer} onDone={onDone} />;
    case "skill":
      return <SkillModal composer={composer} onDone={onDone} />;
    case "personal":
      return <PersonalModal composer={composer} onDone={onDone} />;
  }
}

export function DeleteConfirm() {
  const confirm = useApp((s) => s.confirmDelete);
  const clear = useApp((s) => s.clearDelete);

  return (
    <Modal
      open={!!confirm}
      title="Confirm delete"
      onClose={clear}
      footer={
        <>
          <button className="btn ghost" onClick={clear}>Cancel</button>
          <button
            className="btn danger"
            onClick={() => {
              confirm?.onConfirm();
              clear();
            }}
          >
            Delete
          </button>
        </>
      }
    >
      <p style={{ margin: "0 0 6px" }}>{confirm?.title}</p>
      {confirm?.detail && <p className="mono-dim" style={{ margin: 0 }}>{confirm.detail}</p>}
    </Modal>
  );
}
