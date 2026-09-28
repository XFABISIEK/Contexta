import { check, type Update } from "@tauri-apps/plugin-updater";

/** Silent check: null when up to date, in dev, offline, or on error. */
export async function checkForUpdate(): Promise<Update | null> {
  if (import.meta.env.DEV) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}
