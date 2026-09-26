# SimpleMemory

**Central Memory Layer for AI** — a fast, local, desktop knowledge base for AI agents.

Native desktop app (Tauri 2) · React + TypeScript UI · Rust backend · SQLite + FTS5 ·
hybrid search (FTS today, vector-ready) · relation graph · project context builder.

```
SimpleMemory.exe
      ↓
native Tauri window (no browser, no localhost in production)
      ↓
React UI  →  Tauri IPC  →  Rust services  →  SQLite (WAL)
```

## Requirements

- Node.js 18+ (`node --version`)
- Rust stable 1.77+ (`cargo --version`)
- Windows 10/11 (primary target), WebView2 runtime (preinstalled on Win 10/11)
- Tauri prerequisites: MSVC build tools + Windows 10 SDK (for `tauri build`)

## Development setup

```bash
npm install

# Run the desktop app in dev mode (Vite is used internally by Tauri only):
npm run tauri dev
```

The app opens as a **native window**. In dev, an empty database is seeded
automatically with demo projects (`SimpleMemory`, `Axiom`), rules, memories and skills.

## Commands

| Command               | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm install`         | Install frontend dependencies             |
| `npm run tauri dev`   | Run the desktop app (dev)                 |
| `npm run build`       | Type-check + bundle the frontend to `dist/` |
| `npm run tauri build` | Produce `SimpleMemory.exe` / `.msi` (release) |
| `cargo check` / `cargo test` (in `src-tauri/`) | Check / test the Rust backend |

## Build

```bash
npm run tauri build
```

Output (Windows): `src-tauri/target/release/bundle/` — NSIS `.exe` installer,
MSI package and the standalone binary. The production bundle serves the UI from
embedded assets; it does **not** depend on localhost or any external server.

Icons (`src-tauri/icons/`) are generated, not hand-drawn — regenerate anytime with:

```bash
pip install pillow
python scripts/gen-icons.py
```

## Database

- Location: `%APPDATA%/com.simplememory.app/simplememory.db` (WAL mode)
- Migrations: `src-tauri/src/db.rs` (`001` schema + indexes, `002` FTS5 index +
  sync triggers, `003` composite indexes), tracked in `_migrations`.
- Tables: `projects`, `memories`, `rules`, `skills`, `personal_information`,
  `tags`, `memory_tags`, `connections`, `embeddings` (vector-ready),
  `app_settings`.
- Full-text search: external-content FTS5 table `search_index_fts`
  (`porter unicode61`), kept in sync by triggers on every write. Search always
  runs in SQLite/Rust — the app never loads whole tables into RAM.
- Backups: `VACUUM INTO` timestamped copies in `<app-data>/backups`
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
cargo build --release --bin simplememory-mcp
```

Point any MCP client (Claude Desktop, Cursor, …) at the exe, optionally with
`SIMPLEMEMORY_DB` pointing at the app database (default:
`%APPDATA%/com.simplememory.app/simplememory.db`).

Read tools (context retrieval):

- `simplememory_search` → `search_everything`
- `simplememory_get_project` → `get_project`
- `simplememory_get_project_context` → `get_project_context`
- `simplememory_get_rules` → `list_rules`
- `simplememory_get_memories` → `list_memories`
- `simplememory_get_skills` → `list_skills`
- `simplememory_get_personal_context` → personal-scoped search
- `simplememory_get_graph` → `get_graph`

Write tools (AI can store and curate memory, same validation as the UI):

- `simplememory_add_memory` / `_update_memory` / `_delete_memory`
- `simplememory_add_rule` / `_update_rule` / `_delete_rule`
- `simplememory_add_skill` / `_update_skill` / `_delete_skill`
- `simplememory_add_project` / `_update_project` / `_delete_project`
- `simplememory_add_personal` / `_update_personal` / `_delete_personal`
- `simplememory_link` / `simplememory_unlink`

The full tool spec (names, JSON schemas, example I/O) is copyable from
Settings → MCP, alongside a client config snippet.

Example:

```json
{ "project": "Axiom", "query": "How should I implement authentication?", "max_results": 10 }
```

→ `{ project, rules[], memories[], skills[], personal[], markdown }`

## Project structure

```
SimpleMemory/
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
- `Esc` — close dialogs

## Privacy

Local-only by default: no cloud sync, no telemetry, no analytics, no external
requests. Personal information stays in the local SQLite file; at-rest
encryption (SQLCipher) is planned and the schema is ready for it.
