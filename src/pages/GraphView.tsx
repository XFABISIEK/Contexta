import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  Panel,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
  NodeToolbar,
  useNodesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Crosshair, Search, ZoomIn, ZoomOut, Shuffle, Folder, Brain, ScrollText, Wrench, User } from "lucide-react";
import { AIIcon, aiProfile } from "../components/AIProviderPicker";
import { skillIconSource } from "../components/SkillIcon";
import { GraphSidePanel } from "../components/GraphSidePanel";
import { AI_NODE_ID, layoutGraph } from "../lib/graph-layout";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx } from "../lib/utils";
import type { GraphData, GraphNode } from "../types";

const ALL_TYPES = ["project", "memory", "rule", "skill", "personal"];

const TYPE_META: Record<string, { label: string; icon: typeof Folder }> = {
  project: { label: "Projects", icon: Folder },
  memory: { label: "Memories", icon: Brain },
  rule: { label: "Rules", icon: ScrollText },
  skill: { label: "Skills", icon: Wrench },
  personal: { label: "Personal", icon: User },
};

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
    <div className={cx("gnode", `gnode-${data.node.node_type}`, skillIcon && "has-icon", data.selected && "selected", data.dimmed && "dimmed")}>
      <Anchors />
      {skillIcon && <img className="gnode-icon" src={skillIcon} alt="" aria-hidden="true" draggable={false} />}
      <NodeToolbar isVisible={data.showLabel || data.selected || data.hovered} position={Position.Bottom} offset={8}>
        <span className={cx("gnode-label", (data.selected || data.hovered) && "full")}>{data.node.label}</span>
      </NodeToolbar>
    </div>
  );
}

function AINode({ data }: { data: { provider: string } }) {
  const profile = aiProfile(data.provider);
  return (
    <div className="ai-graph-node" style={{ color: profile.color }}>
      <Anchors />
      <AIIcon provider={data.provider} />
      <NodeToolbar isVisible position={Position.Bottom} offset={10}>
        <span className="gnode-label ai-label">{profile.label}</span>
      </NodeToolbar>
    </div>
  );
}

const nodeTypes = { gnode: GNode, ai: AINode };

function GraphControls({ selectedId, onFit, onShake }: { selectedId: string | null; onFit: () => void; onShake: () => void }) {
  const { fitView, setCenter, getNode, zoomIn, zoomOut } = useReactFlow();
  return (
    <>
      <button className="btn sm" onClick={() => zoomIn({ duration: 200 })} title="Zoom in (+)">
        <ZoomIn />
      </button>
      <button className="btn sm" onClick={() => zoomOut({ duration: 200 })} title="Zoom out (-)">
        <ZoomOut />
      </button>
      <button className="btn sm" onClick={() => { onFit(); fitView({ padding: 0.2, duration: 200 }); }}>
        <Maximize /> Fit View
      </button>
      <button className="btn sm" onClick={onShake} title="Scatter nodes into a fresh arrangement">
        <Shuffle /> Shake
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

/** Keyboard zoom from the app shell: "+" in, "-" out, "0" fit. */
function GraphZoomKeys({ onFit }: { onFit: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  useEffect(() => {
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "in") zoomIn({ duration: 200 });
      else if (detail === "out") zoomOut({ duration: 200 });
      else { onFit(); fitView({ padding: 0.25, duration: 200 }); }
    };
    window.addEventListener("contexa:graph-zoom", onZoom);
    return () => window.removeEventListener("contexa:graph-zoom", onZoom);
  }, [zoomIn, zoomOut, fitView, onFit]);
  return null;
}

function FitGraph({ layoutKey, autoFit, shakeKey }: { layoutKey: string; autoFit: boolean; shakeKey: number }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized || !autoFit) return;
    const frame = requestAnimationFrame(() => fitView({ padding: 0.25 }));
    return () => cancelAnimationFrame(frame);
    // Refit only when the node SET changes on a fresh (user-untouched) camera,
    // or after an explicit shake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, layoutKey, autoFit, shakeKey]);
  return null;
}

export function GraphView({ projectId }: { projectId?: string }) {
  const toast = useApp((s) => s.toast);
  const aiProvider = useApp((s) => s.aiProvider) ?? "claude-code";
  const [data, setData] = useState<GraphData | null>(null);
  const [types, setTypes] = useState<string[]>(ALL_TYPES);
  const limit = 300;
  const [filter, setFilter] = useState("");
  // Deferred so typing never blocks panning: the input stays instant while
  // layout + refit recompute one frame behind.
  const deferredFilter = useDeferredValue(filter);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  // Shake key: bumping it re-runs the layout with a random scatter and
  // forces nodes to adopt the new positions (see FlowCanvas resetKey).
  const [shakeKey, setShakeKey] = useState(0);
  const onShake = useCallback(() => {
    setShakeKey((k) => k + 1);
    setAutoFit(true);
  }, []);
  // Fresh camera auto-fits on new data; the first real user pan/zoom
  // surrenders it so refits never yank a manually framed view.
  const [autoFit, setAutoFit] = useState(true);
  useEffect(() => setAutoFit(true), [projectId]);
  const onMoveStart = useCallback((e: unknown) => {
    setPanning(true);
    if (e) setAutoFit(false);
  }, []);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const tipRaf = useRef(0);

  const load = useCallback(async () => {
    try {
      const g = await api.graph(projectId ? undefined : types, projectId ?? null, limit);
      setData(g);
      // Preserve the selection across reloads (e.g. after an inline save);
      // drop it only when the node is gone.
      setSelected((prev) => (prev && g.nodes.some((n) => n.id === prev.id) ? prev : null));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load graph");
    }
  }, [types, limit, projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("contexa:changed", onChange);
    return () => window.removeEventListener("contexa:changed", onChange);
  }, [load]);

  useEffect(() => () => cancelAnimationFrame(tipRaf.current), []);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = deferredFilter.trim().toLowerCase();
    return data.nodes.filter(
      (n) => types.includes(n.node_type) && (!q || n.label.toLowerCase().includes(q)),
    );
  }, [data, types, deferredFilter]);

  const visibleEdgePairs = useMemo(() => {
    if (!data) return [];
    const ids = new Set(visible.map((n) => n.id));
    return data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [data, visible]);

  const layout = useMemo(
    () => layoutGraph(visible, visibleEdgePairs, shakeKey ? 320 : 0),
    [visible, visibleEdgePairs, shakeKey],
  );
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
      // Explicit dimensions: React Flow hides unmeasured nodes
      // (visibility:hidden) and skips their edges. Our sizes are fixed,
      // so declare them — no ResizeObserver dependency, no wipe on resync.
      width: 84,
      height: 84,
      // Explicit center handles: same geometry as <Anchors/>, parsed straight
      // into handleBounds so edges always have endpoints.
      handles: [
        { id: "s", type: "source" as const, position: Position.Top, x: 42, y: 42, width: 1, height: 1 },
        { id: "t", type: "target" as const, position: Position.Top, x: 42, y: 42, width: 1, height: 1 },
      ],
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
        width: size,
        height: size,
        handles: [
          { id: "s", type: "source" as const, position: Position.Top, x: size / 2, y: size / 2, width: 1, height: 1 },
          { id: "t", type: "target" as const, position: Position.Top, x: size / 2, y: size / 2, width: 1, height: 1 },
        ],
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

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.id === AI_NODE_ID) {
      setSelected(null);
      return;
    }
    // Details + inline editing live in the side panel now.
    setSelected((node.data as { node: GraphNode }).node);
  }, []);

  // Hover/tooltip updates are skipped mid-pan and coalesced to one frame:
  // otherwise every mousemove re-renders 300+ nodes and panning stutters.
  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    if (!panning) setHovered(node.id);
  }, [panning]);
  const onNodeMouseMove = useCallback((e: unknown, node: Node) => {
    if (panning) return;
    const ev = e as unknown as globalThis.MouseEvent;
    const x = ev.clientX, y = ev.clientY, id = node.id;
    cancelAnimationFrame(tipRaf.current);
    tipRaf.current = requestAnimationFrame(() => setTip({ id, x, y }));
  }, [panning]);

  const toggleType = (t: string) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const totalCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  const tipNode = tip
    ? tip.id === AI_NODE_ID
      ? { kind: "AI assistant", label: aiProfile(aiProvider).label }
      : (() => {
          const n = visible.find((v) => v.id === tip.id);
          return n ? { kind: TYPE_META[n.node_type]?.label ?? n.node_type, label: n.label } : null;
        })()
    : null;

  return (
    <div className={projectId ? "graph-page" : "page graph-page"}>
      {!projectId && (
        <div className="page-head" style={{ padding: "22px 26px 0" }}>
          <h1>Graph</h1>
        </div>
      )}
      <div className="graph-toolbar">
        <div className="search-input">
          <Search />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search nodes..." aria-label="Search nodes" />
        </div>
        {!projectId && (
          <>
            <div className="chip-group" role="group" aria-label="Node type filters">
              {ALL_TYPES.map((t) => {
                const meta = TYPE_META[t];
                const on = types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={cx("chip", on && "on")}
                    aria-pressed={on}
                    onClick={() => toggleType(t)}
                    title={`Toggle ${meta.label.toLowerCase()}`}
                  >
                    <meta.icon size={12} />
                    {meta.label}
                    <span className="chip-n">{data?.counts[t] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <span className="mono-dim graph-hint">Drag nodes to move them · drag the background to pan</span>
        {data?.truncated && (
          <span className="mono-dim">Showing {visible.length} of {totalCount} — refine filters.</span>
        )}
      </div>
      <div className="graph-body">
        <div className="graph-canvas">
          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              layoutKey={layoutKey}
              autoFit={autoFit}
              resetKey={shakeKey}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseMove={onNodeMouseMove}
              onNodeMouseLeave={() => { setHovered(null); setTip(null); }}
              onMoveStart={onMoveStart}
              onMoveEnd={() => setPanning(false)}
              onFit={() => setAutoFit(true)}
              onShake={onShake}
              selectedId={selected?.id ?? null}
            />
          </ReactFlowProvider>
          {tipNode && (
            <div
              className="graph-tip"
              style={{
                left: Math.min(tip!.x + 14, window.innerWidth - 240),
                top: Math.max(tip!.y - 12, 8),
              }}
            >
              <span className="graph-tip-type">{tipNode.kind}</span>
              <span className="graph-tip-name">{tipNode.label}</span>
            </div>
          )}
        </div>
        {selected && (
          <GraphSidePanel
            node={selected}
            onSaved={() => window.dispatchEvent(new CustomEvent("contexa:changed"))}
          />
        )}
      </div>
    </div>
  );
}

function FlowCanvas({
  nodes,
  edges,
  layoutKey,
  autoFit,
  resetKey,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseMove,
  onNodeMouseLeave,
  onMoveStart,
  onMoveEnd,
  onFit,
  onShake,
  selectedId,
}: {
  nodes: Node[];
  edges: Edge[];
  layoutKey: string;
  autoFit: boolean;
  resetKey: number;
  onNodeClick: (e: unknown, n: Node) => void;
  onNodeMouseEnter: (e: unknown, n: Node) => void;
  onNodeMouseMove: (e: unknown, n: Node) => void;
  onNodeMouseLeave: () => void;
  onMoveStart: (e: unknown) => void;
  onMoveEnd: () => void;
  onFit: () => void;
  onShake: () => void;
  selectedId: string | null;
}) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  const prevReset = useRef(resetKey);
  useEffect(() => {
    setFlowNodes((current) => {
      if (prevReset.current !== resetKey) {
        // Shake: drop dragged positions and adopt the fresh layout.
        prevReset.current = resetKey;
        return nodes.map((node) => ({ ...node }));
      }
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
    });
  }, [nodes, resetKey, setFlowNodes]);

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
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseMove={onNodeMouseMove}
      onNodeMouseLeave={onNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.02}
      maxZoom={3}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background gap={24} size={1.5} color="#24282e" />
      <FitGraph layoutKey={layoutKey} autoFit={autoFit} shakeKey={resetKey} />
      <GraphZoomKeys onFit={onFit} />
      <Panel position="bottom-left" className="graph-panel">
        <GraphControls selectedId={selectedId} onFit={onFit} onShake={onShake} />
      </Panel>
    </ReactFlow>
  );
}
