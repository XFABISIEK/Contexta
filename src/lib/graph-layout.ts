import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "../types/index.ts";

export const AI_NODE_ID = "__simplememory_ai__";

type SimNode = SimulationNodeDatum & { id: string };
type SimLink = SimulationLinkDatum<SimNode> & { hub?: boolean };

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const hubLinks = nodes
    .filter((n) => n.node_type === "project" || !n.project_id || !ids.has(n.project_id))
    .map((n) => ({ source: AI_NODE_ID, target: n.id }));
  const simNodes: SimNode[] = [{ id: AI_NODE_ID, fx: 0, fy: 0 }, ...nodes.map((n) => ({ id: n.id }))];
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

  return {
    positions: new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
    hubLinks,
  };
}
