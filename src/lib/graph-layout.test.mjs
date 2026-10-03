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

test("unlinked project members anchor to their project, not the center", () => {
  const nodes = [
    { id: "project", node_type: "project", label: "Project", project_id: null, priority: null },
    { id: "member", node_type: "memory", label: "Member", project_id: "project", priority: null },
    { id: "orphan", node_type: "memory", label: "Orphan", project_id: null, priority: null },
  ];
  const { hubLinks, positions } = layoutGraph(nodes, []);
  assert.deepEqual(
    hubLinks.map((e) => [e.source, e.target]),
    [[AI_NODE_ID, "project"], ["project", "member"], [AI_NODE_ID, "orphan"]],
  );
  const pc = positions.get("project");
  const mc = positions.get("member");
  const dx = mc.x - pc.x, dy = mc.y - pc.y;
  assert.ok(Math.hypot(dx, dy) < 400, "member stays near its project");
});

test("spread stays bounded so fit/zoom-out works at 100 and 600 nodes", () => {
  for (const count of [100, 600]) {
    const nodes = Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      node_type: "memory",
      label: `M${i}`,
      project_id: null,
      priority: null,
    }));
    const { positions } = layoutGraph(nodes, []);
    assert.equal(positions.size, count + 1);
    for (const [id, point] of positions) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), id);
      assert.ok(Math.abs(point.x) <= 850 && Math.abs(point.y) <= 850, `${id} out of bounds`);
    }
  }
});
