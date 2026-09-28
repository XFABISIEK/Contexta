import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { PRIORITIES, MEMORY_TYPES } from "../lib/utils";
import { SkillIcon } from "./SkillIcon";
import type { GraphNode, Memory, Project, Rule, Skill, PersonalInfo } from "../types";

type Entity = Memory | Rule | Skill | PersonalInfo | Project;

async function loadEntity(node: GraphNode): Promise<Entity | null> {
  switch (node.node_type) {
    case "memory":
      return api.memories.get(node.id);
    case "rule":
      return api.rules.get(node.id);
    case "skill":
      return api.skills.get(node.id);
    case "personal":
      return api.personal.get(node.id);
    case "project":
      return api.projects.get(node.id);
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function ProjectSelect({ value, projects, global, onChange }: {
  value: string;
  projects: Project[];
  global: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Project">
      <option value="">{global}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Priority">
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}

function MemoryForm({ m, projects, rev, onSaved }: { m: Memory; projects: Project[]; rev: number; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [title, setTitle] = useState(m.title);
  const [content, setContent] = useState(m.content);
  const [memoryType, setMemoryType] = useState(m.memory_type || "fact");
  const [priority, setPriority] = useState(m.priority || "normal");
  const [projectId, setProjectId] = useState(m.project_id ?? "");
  const [tags, setTags] = useState(m.tags.map((t) => t.name).join(", "));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(m.title); setContent(m.content); setMemoryType(m.memory_type || "fact");
    setPriority(m.priority || "normal"); setProjectId(m.project_id ?? "");
    setTags(m.tags.map((t) => t.name).join(", ")); setErr("");
  }, [m, rev]);

  const save = async () => {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.memories.update(m.id, {
        title: title.trim(),
        content,
        memory_type: memoryType,
        priority,
        project_id: projectId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast("success", "Memory updated");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Content"><textarea className="input" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      <div className="field-row">
        <Field label="Type">
          <select className="input" value={memoryType} onChange={(e) => setMemoryType(e.target.value)} aria-label="Type">
            {MEMORY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </Field>
        <Field label="Priority"><PrioritySelect value={priority} onChange={setPriority} /></Field>
      </div>
      <Field label="Project"><ProjectSelect value={projectId} projects={projects} global="No project" onChange={setProjectId} /></Field>
      <Field label="Tags"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" /></Field>
      {err && <div className="field-err">{err}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {m.project_id && (
          <button className="btn sm ghost" onClick={() => go("projects", m.project_id!)}>
            <ExternalLink size={13} /> Project
          </button>
        )}
      </div>
    </>
  );
}

function RuleForm({ r, projects, rev, onSaved }: { r: Rule; projects: Project[]; rev: number; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [title, setTitle] = useState(r.title);
  const [content, setContent] = useState(r.content);
  const [priority, setPriority] = useState(r.priority || "normal");
  const [projectId, setProjectId] = useState(r.project_id ?? "");
  const [enabled, setEnabled] = useState(r.enabled);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(r.title); setContent(r.content); setPriority(r.priority || "normal");
    setProjectId(r.project_id ?? ""); setEnabled(r.enabled); setErr("");
  }, [r, rev]);

  const save = async () => {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.rules.update(r.id, {
        project_id: projectId || null,
        title: title.trim(),
        content,
        priority,
        enabled,
      });
      toast("success", "Rule updated");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Content"><textarea className="input" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      <div className="field-row">
        <Field label="Priority"><PrioritySelect value={priority} onChange={setPriority} /></Field>
        <Field label="Project"><ProjectSelect value={projectId} projects={projects} global="Global" onChange={setProjectId} /></Field>
      </div>
      <div className="field">
        <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
      </div>
      {err && <div className="field-err">{err}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {r.project_id && (
          <button className="btn sm ghost" onClick={() => go("projects", r.project_id!)}>
            <ExternalLink size={13} /> Project
          </button>
        )}
      </div>
    </>
  );
}

function SkillForm({ s, rev, onSaved }: { s: Skill; rev: number; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [content, setContent] = useState(s.content);
  const [category, setCategory] = useState(s.category);
  const [icon, setIcon] = useState(s.icon ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.skills.categories().then(setCategories).catch(() => {});
  }, []);
  useEffect(() => {
    setName(s.name); setDescription(s.description); setContent(s.content);
    setCategory(s.category); setIcon(s.icon ?? ""); setErr("");
  }, [s, rev]);

  const save = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.skills.update(s.id, {
        name: name.trim(),
        description,
        content,
        category: category.trim() || "general",
        icon,
      });
      toast("success", "Skill updated");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Content"><textarea className="input" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      <div className="field-row">
        <Field label="Category">
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} list="graph-skill-categories" />
          <datalist id="graph-skill-categories">
            {categories.map((c) => (<option key={c} value={c} />))}
          </datalist>
        </Field>
        <Field label="Icon">
          <div className="skill-icon-picker">
            <span className="row-icon"><SkillIcon name={name} icon={icon} /></span>
            <button className="btn sm" type="button" onClick={() => fileRef.current?.click()}>Choose</button>
            {icon && <button className="btn sm ghost" type="button" onClick={() => setIcon("")}>Remove</button>}
          </div>
          <input ref={fileRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 128 * 1024) {
              setErr("Choose a PNG, JPEG or WebP image smaller than 128 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => { if (typeof reader.result === "string") { setIcon(reader.result); setErr(""); } };
            reader.onerror = () => setErr("Could not read the image.");
            reader.readAsDataURL(file);
          }} />
        </Field>
      </div>
      {err && <div className="field-err">{err}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </>
  );
}

function PersonalForm({ p, rev, onSaved }: { p: PersonalInfo; rev: number; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const [key, setKey] = useState(p.key);
  const [title, setTitle] = useState(p.title);
  const [content, setContent] = useState(p.content);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKey(p.key); setTitle(p.title); setContent(p.content); setErr("");
  }, [p, rev]);

  const save = async () => {
    if (!key.trim() || !title.trim()) {
      setErr("Key and title are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.personal.update(p.id, { key: key.trim(), title: title.trim(), content });
      toast("success", "Entry updated");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Key"><input className="input" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Content"><textarea className="input" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      {err && <div className="field-err">{err}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </>
  );
}

function ProjectForm({ p, rev, onSaved }: { p: Project; rev: number; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description);
  const [path, setPath] = useState(p.path);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(p.name); setDescription(p.description); setPath(p.path); setErr("");
  }, [p, rev]);

  const save = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.projects.update(p.id, name.trim(), description, path);
      toast("success", "Project updated");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description"><textarea className="input" style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Local folder"><input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="optional" /></Field>
      {err && <div className="field-err">{err}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="btn sm" onClick={() => go("projects", p.id)}>
          <ExternalLink size={13} /> Open
        </button>
      </div>
    </>
  );
}

export function GraphSidePanel({ node, onSaved }: { node: GraphNode; onSaved: () => void }) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [rev, setRev] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [width, setWidth] = useState(() => {
    const v = Number(localStorage.getItem("graph-side-width"));
    return Number.isFinite(v) && v >= 200 && v <= 560 ? v : 260;
  });
  const widthRef = useRef(width);
  widthRef.current = width;
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntity(null);
    loadEntity(node).then((e) => {
      if (cancelled) return;
      setEntity(e);
      setRev((r) => r + 1);
    }).catch(() => {
      if (!cancelled) setEntity(null);
    });
    api.projects.list(undefined, 200, 0).then((p) => {
      if (!cancelled) setProjects(p.items);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [node.id, node.node_type]);

  const onResizerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: widthRef.current };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      setWidth(Math.min(560, Math.max(200, drag.current.w + (drag.current.x - ev.clientX))));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      drag.current = null;
      try {
        localStorage.setItem("graph-side-width", String(widthRef.current));
      } catch {
        /* private mode */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const saved = () => {
    setRev((r) => r + 1);
    onSaved();
  };

  return (
    <div className="graph-side" style={{ width, flexBasis: width }}>
      <div className="graph-resizer" onMouseDown={onResizerDown} title="Drag to resize" />
      <div className="section-title" style={{ marginBottom: 10 }}>{node.node_type}</div>
      {!entity ? (
        <div className="mono-dim">Loading details…</div>
      ) : node.node_type === "memory" ? (
        <MemoryForm key={`${entity.id}:${rev}`} m={entity as Memory} projects={projects} rev={rev} onSaved={saved} />
      ) : node.node_type === "rule" ? (
        <RuleForm key={`${entity.id}:${rev}`} r={entity as Rule} projects={projects} rev={rev} onSaved={saved} />
      ) : node.node_type === "skill" ? (
        <SkillForm key={`${entity.id}:${rev}`} s={entity as Skill} rev={rev} onSaved={saved} />
      ) : node.node_type === "personal" ? (
        <PersonalForm key={`${entity.id}:${rev}`} p={entity as PersonalInfo} rev={rev} onSaved={saved} />
      ) : node.node_type === "project" ? (
        <ProjectForm key={`${entity.id}:${rev}`} p={entity as Project} rev={rev} onSaved={saved} />
      ) : null}
    </div>
  );
}
