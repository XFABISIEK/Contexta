<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Contexta icon" width="96" />
</p>

<h1 align="center">Contexta</h1>

<p align="center">
  <strong>The local memory layer for AI agents.</strong><br />
  Projects, rules, memories and skills in one fast desktop knowledge base.
</p>

<p align="center">
  <a href="https://github.com/XFABISIEK/Contexa/releases"><img src="https://img.shields.io/github/v/release/XFABISIEK/Contexa" alt="release" /></a>
  <a href="https://github.com/XFABISIEK/Contexa/releases"><img src="https://img.shields.io/github/downloads/XFABISIEK/Contexa/total" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" /></a>
</p>

<p align="center">
  <a href="https://github.com/XFABISIEK/Contexa/releases">Download</a> ·
  <a href="#features">Features</a> ·
  <a href="#mcp-model-context-protocol">MCP</a> ·
  <a href="#development-setup">Build from source</a> ·
  <a href="https://github.com/XFABISIEK/Contexa/issues">Report an issue</a>
</p>

<p align="center">
  <img src=".Images/dashboard.png" alt="Contexta dashboard" width="860" />
</p>

Native desktop app (Tauri 2) · React + TypeScript UI · Rust backend · SQLite + FTS5 ·
hybrid search (FTS today, vector-ready) · relation graph · project context builder.

```
contexta.exe
      ↓
native Tauri window (no browser, no localhost in production)
      ↓
React UI  →  Tauri IPC  →  Rust services  →  SQLite (WAL)
```

## Features

- **Dashboard** — quick actions, live statistics, recent memories, modified projects
- **Projects** — overview, memories, rules, linked skills and a scoped graph per project
- **Memories / Rules / Skills / Personal** — full CRUD, priorities (`critical` always reach AI context), tags, FTS search, pagination
- **Graph** — force-directed relation view (drag, pan, zoom, fit/center, type filters, neighbor highlight, details panel)
- **Global search** (`Ctrl+Shift+F`) — SQLite FTS5 grouped by entity type
- **Command palette** (`Ctrl+K`) — navigation + creation shortcuts
- **AI integration** — 12 AI providers with brand icons, project context preview (JSON + Markdown), copyable MCP tool spec
- **MCP server** — standalone `contexa-mcp` stdio binary with 26 read/write tools
- **Local-first** — SQLite (WAL), portable storage location, `VACUUM INTO` backups, JSON export/import
- **Auto-updates** — signed NSIS bundles checked on demand from GitHub releases

## Tech stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Desktop  | Tauri 2 (custom titlebar, updater, dialog, opener)      |
| Frontend | React 18, TypeScript, Vite, Zustand, Zod, Framer Motion |
| Graph    | React Flow + d3-force                                   |
| Backend  | Rust (services → repositories → SQLite)                 |
| Database | SQLite (WAL) + FTS5 (`porter unicode61`)                |
| Tests    | `cargo test`, `node --test`, `tsc --noEmit`             |

## Requirements

- Node.js 18+ (`node --version`)
- Rust stable 1.77+ (`cargo --version`)
- Windows 10/11 (primary target), WebView2 runtime (preinstalled on Win 10/11)
- Tauri prerequisites: MSVC build tools + Windows 10 SDK (for `tauri build`)

## Development setup

```bash
npm install

# Run the desktop app in dev mode (native window, no browser):
npm run dev
```

The app opens as a **native window**. In dev, an empty database is seeded
automatically with demo projects (`Contexta`, `Axiom`), rules, memories and skills.

## Commands

| Command               | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm install`         | Install frontend dependencies             |
| `npm run dev`         | Run the desktop app (native window, dev)  |
| `npm run build`       | Type-check + bundle the frontend to `dist/` |
| `npm run tauri build` | Produce signed updater bundles when `TAURI_SIGNING_PRIVATE_KEY` is set |
| `cargo check` / `cargo test` (in `src-tauri/`) | Check / test the Rust backend |
| `node --test src/lib/graph-layout.test.mjs` | Run the frontend graph-layout test |

## Build

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\simplememory.key"
npm run tauri -- build --bundles nsis
```

Output (Windows): `src-tauri/target/release/bundle/nsis/` — NSIS `.exe` installer
and its updater signature. The standalone binary is `src-tauri/target/release/contexta.exe`.
The production bundle serves the UI from
embedded assets; it does **not** depend on localhost.

## Updates

The Windows app checks `https://github.com/XFABISIEK/Contexa/releases/latest/download/latest.json`
only when the user clicks **Check for updates** in Settings. Tauri verifies the signed NSIS
installer before installing it. The first published release establishes the update feed.

The private signing key is at `%USERPROFILE%\.tauri\simplememory.key` on the build machine;
back it up securely and never commit it. Set its **contents** as the repository secret
`TAURI_SIGNING_PRIVATE_KEY`. The public key is already in `tauri.conf.json`. To publish,
bump the matching versions in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, run the **Windows release** GitHub workflow, then review
and publish its draft release. The workflow uploads the installer, signature, and `latest.json`.

The app icon comes from `.Images/app-icon.png`. Generate the platform icons with:

```bash
npm run tauri -- icon .Images/app-icon.png --output src-tauri/icons
```

## Database

- Location: `%APPDATA%/com.simplememory.app/simplememory.db` (WAL mode)
- On first launch, the user can choose a different folder. Contexta copies the existing SQLite database with `VACUUM INTO`, keeps the original, and stores the active path in `%APPDATA%/com.simplememory.app/storage.json`.
- The internal app identifier and database path retain the original name so existing data remains accessible after the Contexta rename.
- Migrations: `src-tauri/src/db.rs` (`001` schema + indexes, `002` FTS5 index +
  sync triggers, `003` composite indexes, `004` skill icons), tracked in `_migrations`.
- Tables: `projects`, `memories`, `rules`, `skills`, `personal_information`,
  `tags`, `memory_tags`, `connections`, `embeddings` (vector-ready),
  `app_settings`.
- Full-text search: external-content FTS5 table `search_index_fts`
  (`porter unicode61`), kept in sync by triggers on every write. Search always
  runs in SQLite/Rust — the app never loads whole tables into RAM.
- Backups: `VACUUM INTO` timestamped copies beside the active database in `backups/`
  (Settings → Database). Export/import is JSON per database or per project.

## Architecture

```
React (src/)  →  Tauri IPC (invoke)  →  commands.rs (thin)
                                            ↓
services: search.rs (FTS + hybrid scoring) · context.rs (ContextBuilder) · graph.rs
                                            ↓
repos.rs (CRUD, pagination, tags, export/import) · db.rs (connection, migrations, seed)
                                            ↓
                                     SQLite + FTS5
```

- **Hybrid search** (`search.rs`): normalize → FTS5 (`bm25`) → merge vector hits
  (`VectorHit`, zero-weight until an embedding backend is plugged in) →
  rerank by priority (`critical > high > normal > low`) + recency → paged results.
- **ContextBuilder** (`context.rs`): `get_project_context(project, query, max_results, max_tokens)`
  returns critical rules first, project info, ranked memories (+1-hop connection
  expansion), keyword-matched skills, personal info only on query match, plus a
  token-budgeted Markdown rendering.
- **Graph** (`graph.rs`): capped, priority-sampled nodes + explicit connections
  + implicit `belongs_to` edges; never materializes large databases.
- **Frontend** (`src/`): `app/` shell, `components/`, `features`-style `pages/`,
  `stores/` (zustand), `lib/` (typed `invoke` wrappers, utils), `types/`.
  Graph view is lazy-loaded; lists are paginated; search inputs debounced.

## MCP (Model Context Protocol)

Transport is **stdio** via the standalone binary — no public HTTP server:

```bash
cargo build --release --bin contexa-mcp
```

Point any MCP client (Claude Desktop, Cursor, …) at the exe, optionally with
`CONTEXA_DB` pointing at the app database. Without it, the MCP binary reads
the selected storage location from `storage.json` (or uses the default path).

```json
{
  "mcpServers": {
    "contexa": {
      "command": "<path-to>\\contexa-mcp.exe",
      "env": { "CONTEXA_DB": "<appdata>\\com.simplememory.app\\simplememory.db" }
    }
  }
}
```

The bundled Ponytail skill icon is licensed under MIT; its notice is in
`src/assets/skills/LICENSE.ponytail` and in the app's Information page.

Read tools (context retrieval):

- `contexa_search` → `search_everything`
- `contexa_get_project` → `get_project`
- `contexa_get_project_context` → `get_project_context`
- `contexa_get_rules` → `list_rules`
- `contexa_get_memories` → `list_memories`
- `contexa_get_skills` → `list_skills`
- `contexa_get_personal_context` → personal-scoped search
- `contexa_get_graph` → `get_graph`

Write tools (AI can store and curate memory, same validation as the UI):

- `contexa_add_memory` / `_update_memory` / `_delete_memory`
- `contexa_add_rule` / `_update_rule` / `_delete_rule`
- `contexa_add_skill` / `_update_skill` / `_delete_skill`
- `contexa_add_project` / `_update_project` / `_delete_project`
- `contexa_add_personal` / `_update_personal` / `_delete_personal`
- `contexa_link` / `contexa_unlink`
- `contexa_scan_project` (imports AGENTS.md, CLAUDE.md, Cursor rules… from the project folder)

The full tool spec (names, JSON schemas, example I/O) is copyable from
Settings → MCP, alongside a client config snippet.

Example:

```json
{ "project": "Axiom", "query": "How should I implement authentication?", "max_results": 10 }
```

→ `{ project, rules[], memories[], skills[], personal[], markdown }`

## Project structure

```
Contexa/
  src/                    React + TypeScript frontend
    app.tsx               shell (titlebar/sidebar/statusbar + routing)
    components/           Titlebar, Sidebar, StatusBar, CommandPalette,
                          GlobalSearch, EntityModals (CRUD + autosave), Toasts
    pages/                Dashboard, GraphView, Projects, Memories,
                          Rules, Skills, Personal, Settings
    stores/ lib/ types/ styles/
  src-tauri/              Rust backend + Tauri config
    src/ lib.rs commands.rs db.rs models.rs repos.rs
         search.rs context.rs graph.rs
    capabilities/ tauri.conf.json  icons/
  dist/                   production frontend bundle (generated)
```

## Shortcuts

- `Ctrl+K` / `Ctrl+P` — command palette
- `Ctrl+Shift+F` — global search (FTS5)
- `Ctrl+N` — new memory
- `Alt+1..6` — dashboard, projects, memories, rules, skills, graph
- `+` / `-` / `0` (in graph) — zoom in, zoom out, fit view
- `Esc` — close dialogs

## Privacy

No cloud sync, telemetry, or analytics. The app contacts GitHub only when you
check for updates. Personal information stays in the local SQLite file; at-rest
encryption (SQLCipher) is planned and the schema is ready for it.
