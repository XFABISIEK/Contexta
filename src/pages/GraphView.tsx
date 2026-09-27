import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
  NodeToolbar,
  useNodesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Crosshair, Search, Pencil, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { AIIcon, aiProfile } from "../components/AIProviderPicker";
import { skillIconSource } from "../components/SkillIcon";
import { AI_NODE_ID, layoutGraph } from "../lib/graph-layout";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, truncate } from "../lib/utils";
import type { GraphData, GraphNode, Memory, Project, Rule, Skill, PersonalInfo } from "../types";

const ALL_TYPES = ["project", "memory", "rule", "skill", "personal"];

const anchorStyle = { top: "50%", left: "50%", width: 1, height: 1, border: 0, opacity: 0 };

function Anchors() {
  return (
    <>
      <Handle type="source" position={Position.Top} style={anchorStyle} />
      <Handle type="target" position={Position.Top} style={anchorStyle} />
    </>
  );
}

function GNode({ data }: { data: { node: GraphNode; selected: boolean; hovered: boolean; dimmed: boolean; showLabel: boolean } }) {
  const skillIcon = data.node.node_type === "skill" ? skillIconSource(data.node.label, data.node.icon) : null;
  return (
    <div className={cx("gnode", `gnode-${data.node.node_type}`, skillIcon && "has-icon", data.selected && "selected", data.dimmed && "dimmed")} title={data.node.label}>
      <Anchors />
      {skillIcon && <img className="gnode-icon" src={skillIcon} alt="" aria-hidden="true" draggable={false} />}
      <NodeToolbar isVisible={data.showLabel || data.selected || data.hovered} position={Position.Bottom} offset={8}>
        <span className="gnode-label">{data.node.label}</span>
      </NodeToolbar>
    </div>
  );
}

function AINode({ data }: { data: { provider: string } }) {
  const profile = aiProfile(data.provider);
  return (
    <div className="ai-graph-node" style={{ color: profile.color }} title={profile.label}>
      <Anchors />
      <AIIcon provider={data.provider} />
      <NodeToolbar isVisible position={Position.Bottom} offset={10}>
        <span className="gnode-label ai-label">{profile.label}</span>
      </NodeToolbar>
    </div>
  );
}

const nodeTypes = { gnode: GNode, ai: AINode };

function GraphControls({ selectedId }: { selectedId: string | null }) {
  const { fitView, setCenter, getNode, zoomIn, zoomOut } = useReactFlow();
  return (
    <>
      <button className="btn sm" onClick={() => zoomIn({ duration: 200 })} title="Zoom in">
        <ZoomIn />
      </button>
      <button className="btn sm" onClick={() => zoomOut({ duration: 200 })} title="Zoom out">
        <ZoomOut />
      </button>
      <button className="btn sm" onClick={() => fitView({ padding: 0.2, duration: 200 })}>
        <Maximize /> Fit View
      </button>
      <button
        className="btn sm"
        onClick={() => {
          const n = selectedId ? getNode(selectedId) : undefined;
          if (n) setCenter(n.position.x + (n.measured?.width ?? 18) / 2, n.position.y + (n.measured?.height ?? 18) / 2, { zoom: 1.2, duration: 200 });
          else setCenter(0, 0, { zoom: 1, duration: 200 });
        }}
      >
        <Crosshair /> Center
      </button>
    </>
  );
}

function FitGraph({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized) return;
    const frame = requestAnimationFrame(() => fitView({ padding: 0.25 }));
    return () => cancelAnimationFrame(frame);
    // Refit only when the node SET changes — never on hover/selection/data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, layoutKey]);
  return null;
}

export function GraphView({ projectId }: { projectId?: string }) {
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const toast = useApp((s) => s.toast);
  const aiProvider = useApp((s) => s.aiProvider) ?? "chatgpt";
  const [data, setData] = useState<GraphData | null>(null);
  const [types, setTypes] = useState<string[]>(ALL_TYPES);
  const [limit, setLimit] = useState(300);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
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

  const layout = useMemo(() => layoutGraph(visible, visibleEdgePairs), [visible, visibleEdgePairs]);
  const layoutKey = useMemo(() => visible.map((n) => n.id).join(","), [visible]);
  const focused = hovered ?? selected?.id ?? null;
  const neighbors = useMemo(() => {
    const ids = new Set<string>(focused ? [focused] : []);
    if (focused) {
      for (const edge of [...visibleEdgePairs, ...layout.hubLinks]) {
        if (edge.source === focused) ids.add(edge.target);
        if (edge.target === focused) ids.add(edge.source);
      }
    }
    return ids;
  }, [focused, visibleEdgePairs, layout]);

  const nodes: Node[] = useMemo(() => [
    {
      id: AI_NODE_ID,
      type: "ai",
      position: { x: -42, y: -42 },
      data: { provider: aiProvider },
      draggable: false,
    },
    ...visible.map((n) => {
      const point = layout.positions.get(n.id) ?? { x: 0, y: 0 };
      const size = n.node_type === "skill" && skillIconSource(n.label, n.icon) ? 30 : n.node_type === "project" ? 22 : 18;
      return {
        id: n.id,
        type: "gnode",
        position: { x: point.x - size / 2, y: point.y - size / 2 },
        data: {
          node: n,
          selected: selected?.id === n.id,
          hovered: hovered === n.id,
          dimmed: !!focused && !neighbors.has(n.id),
          showLabel: visible.length <= 50 || n.node_type === "project",
        },
      };
    }),
  ], [visible, layout, aiProvider, selected, hovered, focused, neighbors]);

  const edges: Edge[] = useMemo(() => [
    ...layout.hubLinks.map((e) => ({
      id: `hub-${e.target}`,
      source: e.source,
      target: e.target,
      type: "straight",
      style: { stroke: "#485466", strokeWidth: 1, opacity: focused && focused !== AI_NODE_ID && focused !== e.target ? 0.12 : 0.45 },
    })),
    ...visibleEdgePairs.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "straight",
      ariaLabel: `${e.source} ${e.relationship} ${e.target}`,
      style: {
        stroke: e.relationship === "belongs_to" ? "#596576" : "#8297b8",
        strokeWidth: focused && (e.source === focused || e.target === focused) ? 1.8 : 1.2,
        opacity: focused && e.source !== focused && e.target !== focused ? 0.12 : 0.75,
      },
    })),
  ], [layout, visibleEdgePairs, focused]);

  const onNodeClick = useCallback(
    async (_: unknown, node: Node) => {
      if (node.id === AI_NODE_ID) {
        setSelected(null);
        setDetail(null);
        return;
      }
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
    <div className={projectId ? "graph-page" : "page graph-page"}>
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
        <span className="mono-dim">{visible.length} nodes · {visibleEdgePairs.length} edges</span>
        <span className="mono-dim graph-hint">Drag nodes to move them · drag the background to pan</span>
        {data?.truncated && (
          <span className="mono-dim">Showing {visible.length} of {totalCount} — refine filters.</span>
        )}
      </div>
      <div className="graph-body">
        <div className="graph-canvas">
          <ReactFlowProvider>
            <FlowCanvas nodes={nodes} edges={edges} layoutKey={layoutKey} onNodeClick={onNodeClick} onNodeMouseEnter={(_, node) => setHovered(node.id)} onNodeMouseLeave={() => setHovered(null)} selectedId={selected?.id ?? null} />
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
  layoutKey,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  selectedId,
}: {
  nodes: Node[];
  edges: Edge[];
  layoutKey: string;
  onNodeClick: (e: unknown, n: Node) => void;
  onNodeMouseEnter: (e: unknown, n: Node) => void;
  onNodeMouseLeave: () => void;
  selectedId: string | null;
}) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  useEffect(() => {
    setFlowNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
    });
  }, [nodes, setFlowNodes]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      nodesDraggable
      onNodesChange={onNodesChange}
      panOnDrag
      panOnScroll={false}
      zoomOnScroll
      zoomOnPinch
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.15}
      maxZoom={3}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background gap={24} size={1.5} color="#24282e" />
      <FitGraph layoutKey={layoutKey} />
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 5, display: "flex", gap: 6 }}>
        <GraphControls selectedId={selectedId} />
      </div>
    </ReactFlow>
  );
}
