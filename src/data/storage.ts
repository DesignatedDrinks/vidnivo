import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Project } from '../domain/timeline';
import { loadProjectLibrary, saveProjectLibrary } from './storageCore';

export async function loadLocalProjects(): Promise<Project[]> {
  return loadProjectLibrary(AsyncStorage);
}
export async function saveLocalProjects(projects: Project[]): Promise<void> {
  return saveProjectLibrary(AsyncStorage, projects);
}
