import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "../types/index.ts";

export const AI_NODE_ID = "__simplememory_ai__";

type SimNode = SimulationNodeDatum & { id: string };
type SimLink = SimulationLinkDatum<SimNode> & { hub?: boolean };

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const linked = new Set<string>();
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) {
      linked.add(e.source);
      linked.add(e.target);
    }
  }
  // Hub anchors: projects plus true orphans (no project anchor and no edges).
  // Anything already wired (e.g. a skill used by a project) hangs off its
  // own neighbors instead of being torn toward the AI center.
  const hubLinks = nodes
    .filter((n) => n.node_type === "project" || (!n.project_id && !linked.has(n.id)))
    .map((n) => ({ source: AI_NODE_ID, target: n.id }));
  // Deterministic seed: same input -> same layout, no reshuffle on reload.
  const simNodes: SimNode[] = [
    { id: AI_NODE_ID, fx: 0, fy: 0 },
    ...nodes.map((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return { id: n.id, x: Math.cos(a) * 220, y: Math.sin(a) * 220 };
    }),
  ];
  const simLinks: SimLink[] = [
    ...edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map((e) => ({ source: e.source, target: e.target })),
    ...hubLinks.map((e) => ({ ...e, hub: true })),
  ];

  const simulation = forceSimulation(simNodes)
    .force("link", forceLink<SimNode, SimLink>(simLinks).id((n) => n.id).distance((l) => l.hub ? 180 : 90).strength((l) => l.hub ? 0.18 : 0.5))
    .force("charge", forceManyBody<SimNode>().strength((n) => n.id === AI_NODE_ID ? -500 : -95).distanceMax(550))
    .force("collide", forceCollide<SimNode>().radius((n) => n.id === AI_NODE_ID ? 65 : 22))
    .force("center", forceCenter(0, 0))
    .stop();
  // ponytail: synchronous layout relies on the current graph cap; use a worker if it causes visible pauses.
  simulation.tick(120);

  // Keep the spread bounded so fitView/zoom-out works at 100+ nodes:
  // the force spread grows with node count, otherwise fit clamps at
  // minZoom and the graph can never be fully zoomed out.
  let maxAbs = 0;
  for (const n of simNodes) {
    maxAbs = Math.max(maxAbs, Math.abs(n.x ?? 0), Math.abs(n.y ?? 0));
  }
  const BOUND = 850;
  const scale = maxAbs > BOUND ? BOUND / maxAbs : 1;

  return {
    positions: new Map(simNodes.map((n) => [n.id, { x: (n.x ?? 0) * scale, y: (n.y ?? 0) * scale }])),
    hubLinks,
  };
}
