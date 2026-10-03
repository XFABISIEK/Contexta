export const MCP_SERVER_NAME = "Contexa-MCP";
export const MCP_BINARY = "contexa-mcp";

export interface McpTool {
  name: string;
  description: string;
  mapsTo: string;
  kind: "read" | "write";
}

export const MCP_TOOLS: McpTool[] = [
  { name: "contexa_search", description: "Hybrid FTS search across projects, memories, rules, skills.", mapsTo: "search_everything", kind: "read" },
  { name: "contexa_get_project", description: "Fetch a single project by id or name.", mapsTo: "get_project", kind: "read" },
  { name: "contexa_get_project_context", description: "Assemble optimized AI context: critical rules, memories, skills, markdown.", mapsTo: "get_project_context", kind: "read" },
  { name: "contexa_get_rules", description: "List enabled rules, critical first.", mapsTo: "list_rules", kind: "read" },
  { name: "contexa_get_memories", description: "Ranked memory retrieval with filters.", mapsTo: "list_memories", kind: "read" },
  { name: "contexa_get_skills", description: "List skills by keyword/category.", mapsTo: "list_skills", kind: "read" },
  { name: "contexa_get_personal_context", description: "Personal info, only on query match.", mapsTo: "search (personal scope)", kind: "read" },
  { name: "contexa_get_graph", description: "Capped relation graph with edges.", mapsTo: "get_graph", kind: "read" },
  { name: "contexa_history", description: "Previous title/content snapshots of a memory or rule.", mapsTo: "list_history", kind: "read" },
  { name: "contexa_add_memory", description: "AI: store a memory (priority controls context inclusion).", mapsTo: "create_memory", kind: "write" },
  { name: "contexa_update_memory", description: "AI: patch a memory; tags replace.", mapsTo: "update_memory", kind: "write" },
  { name: "contexa_delete_memory", description: "AI: delete a memory.", mapsTo: "delete_memory", kind: "write" },
  { name: "contexa_add_rule", description: "AI: add a project or global rule.", mapsTo: "create_rule", kind: "write" },
  { name: "contexa_update_rule", description: "AI: replace a rule.", mapsTo: "update_rule", kind: "write" },
  { name: "contexa_delete_rule", description: "AI: delete a rule.", mapsTo: "delete_rule", kind: "write" },
  { name: "contexa_add_skill", description: "AI: add a reusable skill.", mapsTo: "create_skill", kind: "write" },
  { name: "contexa_update_skill", description: "AI: replace a skill.", mapsTo: "update_skill", kind: "write" },
  { name: "contexa_delete_skill", description: "AI: delete a skill.", mapsTo: "delete_skill", kind: "write" },
  { name: "contexa_add_project", description: "AI: create a project.", mapsTo: "create_project", kind: "write" },
  { name: "contexa_update_project", description: "AI: rename / re-describe a project.", mapsTo: "update_project", kind: "write" },
  { name: "contexa_delete_project", description: "AI: delete a project.", mapsTo: "delete_project", kind: "write" },
  { name: "contexa_add_personal", description: "AI: store a personal entry (stays local).", mapsTo: "create_personal", kind: "write" },
  { name: "contexa_update_personal", description: "AI: replace a personal entry.", mapsTo: "update_personal", kind: "write" },
  { name: "contexa_delete_personal", description: "AI: delete a personal entry.", mapsTo: "delete_personal", kind: "write" },
  { name: "contexa_link", description: "AI: relate two entities (project uses skill…).", mapsTo: "create_connection", kind: "write" },
  { name: "contexa_unlink", description: "AI: remove a relation.", mapsTo: "delete_connection", kind: "write" },
  { name: "contexa_scan_project", description: "AI: import agent instruction files (AGENTS.md, CLAUDE.md, MUSE.md, GEMINI.md, CODEX.md, .muserules, .cursorrules, .cursor/rules, skills/) into reference memories.", mapsTo: "scan_project_files", kind: "write" },
];

export const mcpClientConfig = (path: string) => JSON.stringify({
  mcpServers: {
    [MCP_SERVER_NAME]: {
      command: `<path-to>\\${MCP_BINARY}.exe`,
      env: { CONTEXA_DB: path },
    },
  },
}, null, 2);

export interface McpPreset {
  id: string;
  label: string;
  /** Where the user pastes the snippet. */
  file: string;
  json: (exe: string, db: string) => string;
}

const serverEntry = (exe: string, db: string) => ({
  command: exe || `<path-to>\\${MCP_BINARY}.exe`,
  env: { CONTEXA_DB: db },
});

const claudeShape = (exe: string, db: string) =>
  JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: serverEntry(exe, db) } }, null, 2);

/** Per-client config shapes so adding Contexta is copy-paste, not guesswork. */
export const MCP_PRESETS: McpPreset[] = [
  {
    id: "claude",
    label: "Claude Desktop",
    file: "%APPDATA%\\Claude\\claude_desktop_config.json",
    json: claudeShape,
  },
  {
    id: "cursor",
    label: "Cursor",
    file: ".cursor/mcp.json in the project, or ~/.cursor/mcp.json",
    json: claudeShape,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    file: "~/.codeium/windsurf/mcp_config.json",
    json: claudeShape,
  },
  {
    id: "vscode",
    label: "VS Code",
    file: ".vscode/mcp.json in the project, or user settings.json under mcp.servers",
    json: (exe, db) => JSON.stringify({ mcp: { servers: { [MCP_SERVER_NAME]: serverEntry(exe, db) } } }, null, 2),
  },
];
