export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export type MemoryType = "fact" | "decision" | "note" | "reference" | "todo";
export type Priority = "critical" | "high" | "normal" | "low";

export interface Memory {
  id: string;
  project_id: string | null;
  title: string;
  content: string;
  memory_type: string;
  priority: string;
  source: string;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: string;
  project_id: string | null;
  title: string;
  content: string;
  priority: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalInfo {
  id: string;
  key: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  source_id: string;
  source_type: string;
  target_id: string;
  target_type: string;
  relationship: string;
  weight: number;
  created_at: string;
}

export interface DashboardStats {
  projects: number;
  memories: number;
  rules: number;
  skills: number;
  connections: number;
  personal: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface SearchResult {
  entity_type: string;
  entity_id: string;
  title: string;
  snippet: string;
  project_id: string | null;
  project_name: string | null;
  priority: string | null;
  score: number;
  updated_at: string;
}

export interface GraphNode {
  id: string;
  node_type: string;
  label: string;
  project_id: string | null;
  priority: string | null;
  icon?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  counts: Record<string, number>;
}

export interface ProjectContext {
  project: Project | null;
  rules: Rule[];
  memories: Memory[];
  skills: Skill[];
  personal: PersonalInfo[];
  markdown: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DbInfo {
  path: string;
  size_bytes: number;
}

export interface StorageSetupInfo {
  configured: boolean;
  default_path: string;
}

export interface ImportResult {
  project: string;
  memories: number;
  rules: number;
}

export interface ScanResult {
  scanned: number;
  imported: number;
  skipped: number;
  files: string[];
}

export type View =
  | "dashboard"
  | "graph"
  | "projects"
  | "memories"
  | "rules"
  | "skills"
  | "personal"
  | "database"
  | "profile"
  | "information"
  | "mcp"
  | "settings";

export type ComposerKind = "project" | "memory" | "rule" | "skill" | "personal";

export interface ComposerState {
  kind: ComposerKind;
  /** existing entity id for edit mode; undefined for create mode */
  editId?: string;
  /** preset project for new memory/rule */
  projectId?: string | null;
}

export interface FileEntry {
  name: string;
  /** Slash-separated path relative to the project folder. */
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
  children: FileEntry[] | null;
}

export interface GrepHit {
  file: string;
  line: number;
  text: string;
}

export interface HistoryEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  content: string;
  created_at: string;
}
