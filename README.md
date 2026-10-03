<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Contexta icon" width="96" />
</p>

<h1 align="center">Contexta</h1>

<p align="center">
  <strong>The local memory layer for AI agents.</strong><br />
  Projects, rules, memories and skills in one fast desktop knowledge base.
</p>

<p align="center">
  <a href="https://github.com/XFABISIEK/Contexta/releases"><img src="https://img.shields.io/github/v/release/XFABISIEK/Contexta" alt="release" /></a>
  <a href="https://github.com/XFABISIEK/Contexta/releases"><img src="https://img.shields.io/github/downloads/XFABISIEK/Contexta/total" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" /></a>
</p>

<p align="center">
  <a href="https://github.com/XFABISIEK/Contexta/releases">Download</a> ·
  <a href="#features">Features</a> ·
  <a href="#mcp-model-context-protocol">MCP</a> ·
  <a href="#development-setup">Build from source</a> ·
  <a href="https://github.com/XFABISIEK/Contexta/issues">Report an issue</a>
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

## Contents

- [Features](#features)
- [Install](#install)
- [Development setup](#development-setup)
- [MCP (Model Context Protocol)](#mcp-model-context-protocol)
- [Database](#database)
- [Architecture](#architecture)
- [Shortcuts](#shortcuts)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Privacy](#privacy)

<!-- Screenshots: save app captures as images/dashboard.png, images/graph.png and images/settings.png, then reference them here. -->

## Features

**Capture**
- **Dashboard** — clickable statistics, quick actions, recent memories, modified projects
- **Projects** — overview, memories, rules, linked skills and a scoped graph per project
- **Memories / Rules / Skills / Personal** — full CRUD, priorities (`critical` always reach AI context), tags, FTS search, pagination
- **Project scan** — imports AGENTS.md, CLAUDE.md and Cursor rules from the project folder, refreshes on change

**Retrieve**
- **Graph** — force-directed relation view (drag, pan, zoom, fit/center, type filters, neighbor highlight, details panel)
- **Global search** (`Ctrl+Shift+F`) — SQLite FTS5 grouped by entity type
- **Command palette** (`Ctrl+K`) — navigation + creation shortcuts

**AI integration**
- **9 AI providers** with brand icons, project context preview (JSON + Markdown), copyable MCP tool spec
- **MCP server** — standalone `contexa-mcp` stdio binary with 27 read/write tools

**Local-first**
- **Settings** — density, accent color, animations toggle, status bar toggle, rebindable shortcuts
- **Storage** — SQLite (WAL), portable storage location, `VACUUM INTO` backups, JSON export/import
- **Auto-updates** — signed NSIS bundles checked automatically on launch + on demand from GitHub releases

## Install

1. Download the latest Windows installer from the
   [Releases page](https://github.com/XFABISIEK/Contexta/releases).
2. Run the `.exe` (NSIS) installer and launch Contexta.
3. On first launch pick where the database lives (default:
   `%APPDATA%/com.contexta.app/contexta.db`), then pick your AI provider.
4. Point your AI client at the MCP server (see below) and ask away.

No account, no cloud, no localhost in production — the UI is embedded in the binary.

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
automatically with demo projects (`Contexta`, `Axiom`), rules and memories (no demo skills).

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
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\contexta.key"
npm run tauri -- build --bundles nsis
```

Output (Windows): `src-tauri/target/release/bundle/nsis/` — NSIS `.exe` installer
and its updater signature. The standalone binary is `src-tauri/target/release/contexta.exe`.
The production bundle serves the UI from
embedded assets; it does **not** depend on localhost.

## Updates

The Windows app checks `https://github.com/XFABISIEK/Contexta/releases/latest/download/latest.json`
automatically shortly after launch, and on demand via **Check for updates** in Settings → Advanced.
Tauri verifies the signed NSIS installer before installing it; restart applies it.
The first published release establishes the update feed.

The private signing key is at `%USERPROFILE%\.tauri\contexta.key` on the build machine;
back it up securely and never commit it. Set its **contents** as the repository secret
`TAURI_SIGNING_PRIVATE_KEY`. The public key is already in `tauri.conf.json`. To publish,
bump the matching versions in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, run the **Windows release** GitHub workflow, then review
and publish its draft release. The workflow uploads the installer, signature, and `latest.json`.

The app icon comes from `images/app-icon.png`. Generate the platform icons with:

```bash
npm run tauri -- icon images/app-icon.png --output src-tauri/icons
```

## Database

- Location: `%APPDATA%/com.contexta.app/contexta.db` (WAL mode)
- On first launch, the user can choose a different folder. If the folder already holds a `contexta.db`, Contexta adopts it; otherwise it copies the existing SQLite database with `VACUUM INTO`, keeps the original, and stores the active path in `%APPDATA%/com.contexta.app/storage.json`.
- Rename note: the app identifier and database were `com.simplememory.app/simplememory.db` before. The first launch after the rename automatically reuses that legacy location (custom `storage.json` target or a file copy), keeping the original files in place.
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
    "Contexa-MCP": {
      "command": "<path-to>\\contexa-mcp.exe",
      "env": { "CONTEXA_DB": "<appdata>\\com.contexta.app\\contexta.db" }
    }
  }
}
```

The bundled Ponytail skill icon is licensed under MIT; its notice is in
`src/assets/skills/LICENSE.ponytail`.

Write tools run the same validation as the UI.

| Area | Tools |
| ---- | ----- |
| Read (context retrieval) | `contexa_search`, `contexa_get_project`, `contexa_get_project_context`, `contexa_get_rules`, `contexa_get_memories`, `contexa_get_skills`, `contexa_get_personal_context`, `contexa_get_graph`, `contexa_history` |
| Memories | `contexa_add_memory`, `contexa_update_memory`, `contexa_delete_memory` |
| Rules | `contexa_add_rule`, `contexa_update_rule`, `contexa_delete_rule` |
| Skills | `contexa_add_skill`, `contexa_update_skill`, `contexa_delete_skill` |
| Projects | `contexa_add_project`, `contexa_update_project`, `contexa_delete_project` |
| Personal | `contexa_add_personal`, `contexa_update_personal`, `contexa_delete_personal` |
| Relations | `contexa_link`, `contexa_unlink` |
| Import | `contexa_scan_project` (AGENTS.md, CLAUDE.md, MUSE.md, GEMINI.md, CODEX.md, `.muserules`, `.cursorrules`, `.cursor/rules`, `skills/` → reference memories) |

The server advertises itself as `Contexa-MCP` (with the app icon) and the full
tool spec (names, JSON schemas, example I/O) is copyable from the MCP tab,
alongside a client config snippet.

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
- `↑` / `↓` + `Enter` — move in lists, open highlighted row
- `Alt+1..7` — dashboard, projects, memories, rules, skills, graph, MCP
- `+` / `-` / `0` (in graph) — zoom in, zoom out, fit view
- `Esc` — close dialogs
- Palette, search and new-memory bindings are rebindable in Settings → Shortcuts.

## FAQ

**Where is my data?**
`%APPDATA%/com.contexta.app/contexta.db` by default (WAL mode), or the folder
you picked on first launch. Back it up from Settings → Database.

**Is my data sent anywhere?**
No. AI clients read it locally over MCP stdio. The only network call is the
update check against GitHub releases.

**I moved my project folder. Do I rescan?**
Yes — open the project and run the scan again. Changed files refresh in place,
unchanged ones are skipped, so rescans are cheap.

**Shortcuts conflict with my editor?**
Settings → Keybinds rebinds the palette, global search and new-memory actions.
Duplicates are rejected automatically.

## Contributing

- Use conventional commits (`feat:`, `fix:`, …).
- Backend: `cargo check` / `cargo test` in `src-tauri/`.
- Frontend: `npx tsc --noEmit` plus `node --test src/lib/graph-layout.test.mjs`.
- Keep search in SQLite/FTS — never load whole tables into RAM.

## Privacy

No cloud sync, telemetry, or analytics. The app contacts GitHub only when you
check for updates. Personal information stays in the local SQLite file; at-rest
encryption (SQLCipher) is planned and the schema is ready for it.
