import { invoke } from "@tauri-apps/api/core";
import type {
  ActivityDay,
  Connection,
  DashboardStats,
  DbInfo,
  GraphData,
  ImportResult,
  Memory,
  Paged,
  PersonalInfo,
  Project,
  ProjectContext,
  Rule,
  ScanResult,
  SearchResult,
  Skill,
  StorageSetupInfo,
  Tag,
} from "../types";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : `Command ${cmd} failed`);
  }
}

export const api = {
  storage: {
    info: () => call<StorageSetupInfo>("get_storage_setup"),
    complete: (directory: string | null) => call<string>("complete_storage_setup", { directory }),
  },
  stats: () => call<DashboardStats>("get_dashboard_stats"),
  activity: (days = 365) => call<ActivityDay[]>("activity_stats", { days }),
  dbInfo: () => call<DbInfo>("get_db_info"),

  projects: {
    list: (query?: string, limit = 50, offset = 0) =>
      call<Paged<Project>>("list_projects", { query: query || null, limit, offset }),
    get: (id: string) => call<Project | null>("get_project", { id }),
    create: (name: string, description?: string, path?: string) =>
      call<Project>("create_project", { input: { name, description: description ?? "", path: path ?? "" } }),
    update: (id: string, name: string, description?: string, path?: string) =>
      call<Project>("update_project", { id, input: { name, description: description ?? "", path: path ?? "" } }),
    remove: (id: string) => call<void>("delete_project", { id }),
  },

  memories: {
    list: (opts: {
      projectId?: string | null;
      memoryType?: string | null;
      priority?: string | null;
      query?: string | null;
      limit?: number;
      offset?: number;
    }) =>
      call<Paged<Memory>>("list_memories", {
        projectId: opts.projectId ?? null,
        memoryType: opts.memoryType ?? null,
        priority: opts.priority ?? null,
        query: opts.query ?? null,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0,
      }),
    get: (id: string) => call<Memory | null>("get_memory", { id }),
    create: (input: {
      project_id?: string | null;
      title: string;
      content: string;
      memory_type?: string;
      priority?: string;
      source?: string;
      tags?: string[];
    }) => call<Memory>("create_memory", { input }),
    update: (
      id: string,
      input: {
        title?: string;
        content?: string;
        project_id?: string | null;
        memory_type?: string;
        priority?: string;
        source?: string;
        tags?: string[];
      },
    ) => call<Memory>("update_memory", { id, input }),
    remove: (id: string) => call<void>("delete_memory", { id }),
  },

  rules: {
    list: (projectId?: string | null, limit = 50, offset = 0) =>
      call<Paged<Rule>>("list_rules", { projectId: projectId ?? null, limit, offset }),
    get: (id: string) => call<Rule | null>("get_rule", { id }),
    create: (input: { project_id?: string | null; title: string; content: string; priority?: string; enabled?: boolean }) =>
      call<Rule>("create_rule", { input }),
    update: (id: string, input: { project_id?: string | null; title: string; content: string; priority?: string; enabled?: boolean }) =>
      call<Rule>("update_rule", { id, input }),
    remove: (id: string) => call<void>("delete_rule", { id }),
  },

  skills: {
    list: (query?: string | null, category?: string | null, limit = 50, offset = 0) =>
      call<Paged<Skill>>("list_skills", { query: query ?? null, category: category ?? null, limit, offset }),
    categories: () => call<string[]>("list_skill_categories"),
    get: (id: string) => call<Skill | null>("get_skill", { id }),
    create: (input: { name: string; description?: string; content?: string; category?: string; icon?: string }) =>
      call<Skill>("create_skill", { input }),
    update: (id: string, input: { name: string; description?: string; content?: string; category?: string; icon?: string }) =>
      call<Skill>("update_skill", { id, input }),
    remove: (id: string) => call<void>("delete_skill", { id }),
  },

  personal: {
    list: () => call<PersonalInfo[]>("list_personal"),
    get: (id: string) => call<PersonalInfo | null>("get_personal", { id }),
    create: (input: { key: string; title: string; content: string }) =>
      call<PersonalInfo>("create_personal", { input }),
    update: (id: string, input: { key: string; title: string; content: string }) =>
      call<PersonalInfo>("update_personal", { id, input }),
    remove: (id: string) => call<void>("delete_personal", { id }),
  },

  tags: {
    list: () => call<Tag[]>("list_tags"),
  },

  connections: {
    list: (entityId?: string | null, limit = 100, offset = 0) =>
      call<Paged<Connection>>("list_connections", { entityId: entityId ?? null, limit, offset }),
    create: (input: {
      source_id: string;
      source_type: string;
      target_id: string;
      target_type: string;
      relationship?: string;
      weight?: number;
    }) => call<Connection>("create_connection", { input }),
    remove: (id: string) => call<void>("delete_connection", { id }),
  },

  search: (query: string, entityTypes?: string[], projectId?: string | null, limit = 30, offset = 0) =>
    call<Paged<SearchResult>>("search_everything", {
      query,
      entityTypes: entityTypes ?? null,
      projectId: projectId ?? null,
      limit,
      offset,
    }),

  graph: (entityTypes?: string[], projectId?: string | null, limit = 300) =>
    call<GraphData>("get_graph", {
      entityTypes: entityTypes ?? null,
      projectId: projectId ?? null,
      limit,
    }),

  context: (project: string, query: string, maxResults = 10, maxTokens = 4000) =>
    call<ProjectContext>("get_project_context", { project, query, maxResults, maxTokens }),

  settings: {
    all: () => call<Record<string, string>>("get_settings"),
    set: (key: string, value: string) => call<void>("set_setting", { key, value }),
  },

  exportDb: () => call<string>("export_database"),
  exportProject: (id: string) => call<string>("export_project", { id }),
  importProject: (json: string) => call<ImportResult>("import_project", { json }),
  backup: () => call<string>("backup_database"),
  scanProject: (projectId: string) => call<ScanResult>("scan_project_files", { projectId }),
};
