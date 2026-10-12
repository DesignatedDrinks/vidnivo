import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Project } from '../domain/timeline';
import { encodeProjects, decodeProjects } from './storageCodec';

const KEY = '@vidnivo/projects/v1';
const BACKUP = '@vidnivo/projects/last-good/v1';
export async function loadLocalProjects(): Promise<Project[]> {
  const raw=await AsyncStorage.getItem(KEY);
  if(raw===null)return [];
  try {
    return decodeProjects(raw);
  } catch {
    const backup=await AsyncStorage.getItem(BACKUP);
    if(backup===null)throw new Error('Project library is damaged and no backup is available. Do not uninstall the app.');
    try {
      const recovered=decodeProjects(backup);
      await AsyncStorage.setItem(KEY,backup);
      return recovered;
    } catch {
      throw new Error('Project library and local backup are damaged. Do not uninstall the app; contact support to recover the project database.');
    }
  }
}
export async function saveLocalProjects(projects:Project[]):Promise<void> {
  const next=encodeProjects(projects);
  const previous=await AsyncStorage.getItem(KEY);
  if(previous!==null){
    try {
      decodeProjects(previous);
      await AsyncStorage.setItem(BACKUP,previous);
    } catch {
      // Preserve an older valid backup if the current primary is already bad.
    }
  }
  await AsyncStorage.setItem(KEY,next);
}
