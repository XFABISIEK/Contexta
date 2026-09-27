import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AI_NODE_ID, layoutGraph } from "./graph-layout.ts";

test("AI stays centered and every top-level component joins the layout", () => {
  assert.deepEqual(layoutGraph([], []).positions.get(AI_NODE_ID), { x: 0, y: 0 });
  const nodes = [
    { id: "project", node_type: "project", label: "Project", project_id: null, priority: null },
    { id: "memory", node_type: "memory", label: "Memory", project_id: "project", priority: null },
    { id: "skill", node_type: "skill", label: "Skill", project_id: null, priority: null },
  ];
  const edges = [{ id: "belongs", source: "memory", target: "project", relationship: "belongs_to" }];
  const { positions, hubLinks } = layoutGraph(nodes, edges);
  assert.deepEqual(positions.get(AI_NODE_ID), { x: 0, y: 0 });
  assert.deepEqual(hubLinks.map((e) => e.target), ["project", "skill"]);
  // A skill already wired to a project hangs off the project, not the hub.
  const wired = layoutGraph(
    [...nodes, { id: "used", node_type: "skill", label: "Used", project_id: null, priority: null }],
    [...edges, { id: "uses", source: "project", target: "used", relationship: "uses" }],
  );
  assert.deepEqual(wired.hubLinks.map((e) => e.target), ["project", "skill"]);
  assert.equal(positions.size, 4);
  for (const point of positions.values()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  assert.notDeepEqual(positions.get("project"), positions.get("memory"));
});
