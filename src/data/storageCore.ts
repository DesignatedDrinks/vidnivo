import type { Project } from '../domain/timeline.ts';
import { encodeProjects, decodeProjects } from './storageCodec.ts';

export interface ProjectStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export const PROJECT_KEY = '@vidnivo/projects/v1';
export const BACKUP_KEY = '@vidnivo/projects/last-good/v1';

/**
 * Load validated project data. A malformed primary can be restored only from
 * a validated backup. Nothing is saved when both versions are unusable.
 */
export async function loadProjectLibrary(store: ProjectStore): Promise<Project[]> {
  const primary = await store.getItem(PROJECT_KEY);
  if (primary !== null) {
    try { return decodeProjects(primary); }
    catch {
      // Recover exclusively from a known-good backup. Never return [] here.
    }
  }
  const backup = await store.getItem(BACKUP_KEY);
  if (backup === null) {
    if (primary === null) return []; // Actual first install, not corruption.
    throw new Error('The draft database is corrupt and no backup is available. Do not uninstall the app.');
  }
  let projects: Project[];
  try { projects = decodeProjects(backup); }
  catch {
    throw new Error('Both the draft database and its backup are corrupt. No data has been overwritten.');
  }
  try { await store.setItem(PROJECT_KEY, backup); }
  catch {
    throw new Error('A valid backup was found but could not be restored. Free device storage and retry. No existing projects were overwritten.');
  }
  return projects;
}

/**
 * Only overwrite the primary after encoding the new state and protecting the
 * previous valid version. A failed backup write aborts the primary update.
 */
export async function saveProjectLibrary(store: ProjectStore, projects: Project[]): Promise<void> {
  const encoded = encodeProjects(projects);
  const previous = await store.getItem(PROJECT_KEY);
  if (previous !== null) {
    try {
      decodeProjects(previous);
      if (previous !== encoded) await store.setItem(BACKUP_KEY, previous);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Project')) {
        // Existing primary is malformed. Preserve its bytes and the current
        // backup for explicit recovery rather than masking the corruption.
        throw new Error('Existing draft data is invalid. Saving was blocked to protect the recovery copy.');
      }
      throw error;
    }
  }
  await store.setItem(PROJECT_KEY, encoded);
}
