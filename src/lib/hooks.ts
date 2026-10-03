import { useEffect, useState } from "react";
import { api } from "./tauri";
import type { Project } from "../types";

/** Re-run `load` whenever any entity is created, updated or deleted. */
export function useContexaChanged(load: () => void) {
  useEffect(() => {
    window.addEventListener("contexa:changed", load);
    return () => window.removeEventListener("contexa:changed", load);
  }, [load]);
}

/** Project options for selects (200 most recent). */
export function useProjectOptions() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    api.projects.list(undefined, 200, 0).then((p) => setProjects(p.items)).catch(() => {});
  }, []);
  return projects;
}
