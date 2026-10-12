import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Project } from '../domain/timeline';
import { validateProject } from '../domain/timeline';

const KEY = '@vidnivo/projects/v1';
export async function loadLocalProjects(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is Project => {
      try { validateProject(p); return true; } catch { return false; }
    });
  } catch { return []; }
}
export async function saveLocalProjects(projects: Project[]): Promise<void> {
  projects.forEach(validateProject);
  await AsyncStorage.setItem(KEY, JSON.stringify(projects));
}
