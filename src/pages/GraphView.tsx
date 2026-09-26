import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Folder,
  Brain,
  ScrollText,
  Wrench,
  User,
  Maximize,
  Crosshair,
  Search,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, truncate } from "../lib/utils";
import type { GraphData, GraphNode, Memory, Project, Rule, Skill, PersonalInfo } from "../types";

const TYPE_ICON: Record<string, typeof Folder> = {
  project: Folder,
  memory: Brain,
  rule: ScrollText,
  skill: Wrench,
  personal: User,
};

const ALL_TYPES = ["project", "memory", "rule", "skill", "personal"];

function GNode({ data }: { data: { node: GraphNode; selected: boolean } }) {
  const Icon = TYPE_ICON[data.node.node_type] ?? Brain;
  return (
    <div className={cx("gnode", `gnode-${data.node.node_type}`, data.selected && "selected")}>
      <Icon />
      <span className="lbl" title={data.node.label}>{data.node.label}</span>
    </div>
  );
}

const nodeTypes = { gnode: GNode };

const LAYER_ORDER = ["project", "memory", "rule", "skill", "personal"];

/**
 * Compact tidy tree: BFS from the roots, one column per depth, parents
 * vertically centered over their children, disconnected nodes in a grid
 * band below. Small enough that edges stay at readable zoom.
 */
function layoutTree(
  nodes: GraphNode[],
  edges: Array<{ source: string; target: string }>,
  rootId: string | null,
): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  edges.forEach((e) => link(e.source, e.target));

  const roots: string[] = [];
  if (rootId && byId.has(rootId)) {
    roots.push(rootId);
  } else {
    nodes.filter((n) => n.node_type === "project").forEach((n) => roots.push(n.id));
    if (roots.length === 0 && nodes[0]) roots.push(nodes[0].id);
  }

  // BFS: parent, depth, children in stable type/label order.
  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const queue: string[] = [];
  roots.forEach((r) => {
    parent.set(r, null);
    depth.set(r, 0);
    queue.push(r);
  });
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const kids = [...(adj.get(cur) ?? [])].filter((nb) => !parent.has(nb));
    kids.sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      return (
        LAYER_ORDER.indexOf(na.node_type) - LAYER_ORDER.indexOf(nb.node_type) ||
        na.label.localeCompare(nb.label)
      );
    });
    for (const nb of kids) {
      parent.set(nb, cur);
      depth.set(nb, depth.get(cur)! + 1);
      queue.push(nb);
    }
  }

  const children = new Map<string, string[]>();
  parent.forEach((p, id) => {
    if (p) {
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(id);
    }
  });
  const orphans = nodes
    .filter((n) => !parent.has(n.id))
    .sort(
      (a, b) =>
        LAYER_ORDER.indexOf(a.node_type) - LAYER_ORDER.indexOf(b.node_type) ||
        a.label.localeCompare(b.label),
    );

  // Post-order Y: leaves take sequential slots, parents center on children.
  const Y_GAP = 62;
  const yOf = new Map<string, number>();
  let cursor = 0;
  const assignY = (id: string) => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      yOf.set(id, cursor * Y_GAP);
      cursor += 1;
      return;
    }
    kids.forEach(assignY);
    const ys = kids.map((k) => yOf.get(k)!);
    yOf.set(id, (Math.min(...ys) + Math.max(...ys)) / 2);
  };
  roots.forEach((r, i) => {
    if (i > 0) cursor += 1; // breathing room between trees
    assignY(r);
  });

  const X_STEP = 290;
  const pos = new Map<string, { x: number; y: number }>();
  const treeH = cursor * Y_GAP;
  parent.forEach((_, id) => {
    pos.set(id, { x: (depth.get(id) ?? 0) * X_STEP, y: (yOf.get(id) ?? 0) - treeH / 2 });
  });

  // Orphans: compact grid band under the trees.
  if (orphans.length > 0) {
    const cols = Math.min(orphans.length, 4);
    orphans.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos.set(n.id, {
        x: col * 230,
        y: treeH / 2 + 50 + row * Y_GAP,
      });
    });
  }

  return nodes.map((n) => ({
    id: n.id,
    type: "gnode",
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: { node: n, selected: false },
  }) satisfies Node);
}

function GraphControls({ selectedId }: { selectedId: string | null }) {
  const { fitView, setCenter, getNode } = useReactFlow();
  return (
    <>
      <button className="btn sm" onClick={() => fitView({ padding: 0.2, duration: 200 })}>
        <Maximize /> Fit View
      </button>
      <button
        className="btn sm"
        onClick={() => {
          const n = selectedId ? getNode(selectedId) : undefined;
          if (n) setCenter(n.position.x + 80, n.position.y + 16, { zoom: 1.2, duration: 200 });
          else fitView({ padding: 0.2, duration: 200 });
        }}
      >
        <Crosshair /> Center
      </button>
    </>
  );
}

export function GraphView({ projectId }: { projectId?: string }) {
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<GraphData | null>(null);
  const [types, setTypes] = useState<string[]>(ALL_TYPES);
  const [limit, setLimit] = useState(300);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [detail, setDetail] = useState<{ title: string; body: string; project?: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await api.graph(projectId ? undefined : types, projectId ?? null, limit);
      setData(g);
      setSelected(null);
      setDetail(null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load graph");
    }
  }, [types, limit, projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.nodes.filter(
      (n) => types.includes(n.node_type) && (!q || n.label.toLowerCase().includes(q)),
    );
  }, [data, types, filter]);

  const visibleEdgePairs = useMemo(() => {
    if (!data) return [];
    const ids = new Set(visible.map((n) => n.id));
    return data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [data, visible]);

  // Stable tree root per dataset: explicit project, else the first project.
  const rootId = useMemo(() => {
    if (projectId) return projectId;
    return visible.find((n) => n.node_type === "project")?.id ?? null;
  }, [data, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodes: Node[] = useMemo(
    () =>
      layoutTree(visible, visibleEdgePairs, rootId).map((n) => ({
        ...n,
        data: { ...(n.data as object), selected: (n.id as string) === selected?.id },
      })),
    [visible, visibleEdgePairs, rootId, selected],
  );

  const edges: Edge[] = useMemo(
    () =>
      visibleEdgePairs.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.relationship === "belongs_to" ? undefined : e.relationship,
        style:
          e.relationship === "belongs_to"
            ? { stroke: "#5b6474", strokeWidth: 2 }
            : { stroke: "rgba(55,148,255,0.65)", strokeWidth: 2 },
        labelStyle: { fill: "#9da5b4", fontSize: 9, fontFamily: "var(--font)" },
      })),
    [visibleEdgePairs],
  );

  const onNodeClick = useCallback(
    async (_: unknown, node: Node) => {
      const gn = (node.data as { node: GraphNode }).node;
      setSelected(gn);
      try {
        if (gn.node_type === "memory") {
          const m: Memory | null = await api.memories.get(gn.id);
          setDetail(m ? { title: m.title, body: m.content, project: m.project_id } : null);
        } else if (gn.node_type === "project") {
          const p: Project | null = await api.projects.get(gn.id);
          setDetail(p ? { title: p.name, body: p.description } : null);
        } else if (gn.node_type === "rule") {
          const page = await api.rules.list(null, 500, 0);
          const r: Rule | undefined = page.items.find((x) => x.id === gn.id);
          setDetail(r ? { title: r.title, body: r.content, project: r.project_id } : null);
        } else if (gn.node_type === "skill") {
          const page = await api.skills.list(null, null, 500, 0);
          const s: Skill | undefined = page.items.find((x) => x.id === gn.id);
          setDetail(s ? { title: s.name, body: s.description } : null);
        } else if (gn.node_type === "personal") {
          const items: PersonalInfo[] = await api.personal.list();
          const p = items.find((x) => x.id === gn.id);
          setDetail(p ? { title: p.title, body: p.content } : null);
        }
      } catch {
        setDetail(null);
      }
    },
    [],
  );

  const toggleType = (t: string) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const totalCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className={projectId ? "graph-page" : "page graph-page"} style={projectId ? { height: "100%" } : { height: "calc(100vh - 59px)", maxWidth: "none", padding: 0 }}>
      {!projectId && (
        <div className="page-head" style={{ padding: "22px 26px 0" }}>
          <h1>Graph</h1>
          <div className="sub">Relations between projects, memories, rules and skills.</div>
        </div>
      )}
      <div className="graph-toolbar">
        <div className="search-input">
          <Search />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search nodes..." aria-label="Search nodes" />
        </div>
        {!projectId && (
          <>
            {ALL_TYPES.map((t) => (
              <label key={t} className="check" style={{ fontSize: 11.5 }}>
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} />
                {t}
              </label>
            ))}
            <select className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Node limit">
              <option value={100}>100 nodes</option>
              <option value={300}>300 nodes</option>
              <option value={600}>600 nodes</option>
            </select>
          </>
        )}
        <span className="mono-dim">{visible.length} nodes · {edges.length} edges</span>
        {data?.truncated && (
          <span className="mono-dim">Showing {visible.length} of {totalCount} — refine filters.</span>
        )}
      </div>
      <div className="graph-body">
        <div className="graph-canvas">
          <ReactFlowProvider>
            <FlowCanvas nodes={nodes} edges={edges} onNodeClick={onNodeClick} selectedId={selected?.id ?? null} />
          </ReactFlowProvider>
        </div>
        {selected && (
          <div className="graph-side">
            <div className="section-title" style={{ marginBottom: 6 }}>{selected.node_type}</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 13.5 }}>{selected.label}</h3>
            {detail ? (
              <>
                <p className="mono-dim" style={{ whiteSpace: "pre-wrap" }}>{truncate(detail.body || "—", 600)}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  {(selected.node_type === "memory" || selected.node_type === "rule" || selected.node_type === "skill" || selected.node_type === "personal") && (
                    <button
                      className="btn sm"
                      onClick={() => setComposer({ kind: selected.node_type as "memory" | "rule" | "skill" | "personal", editId: selected.id })}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {selected.node_type === "project" && (
                    <button className="btn sm" onClick={() => go("projects", selected.id)}>
                      <ExternalLink size={13} /> Open
                    </button>
                  )}
                  {detail.project && (
                    <button className="btn sm ghost" onClick={() => go("projects", detail.project!)}>
                      <ExternalLink size={13} /> Project
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="mono-dim">Loading details…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCanvas({
  nodes,
  edges,
  onNodeClick,
  selectedId,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (e: unknown, n: Node) => void;
  selectedId: string | null;
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background gap={24} size={1.5} color="#24282e" />
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 5, display: "flex", gap: 6 }}>
        <GraphControls selectedId={selectedId} />
      </div>
    </ReactFlow>
  );
}
