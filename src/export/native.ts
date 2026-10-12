import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Project } from '../domain/timeline';
import { createExportPlan } from './plan';
import { exportPreflight } from './preflight';
import * as Sharing from 'expo-sharing';

interface ExportModule { exportProject(payload: string): Promise<string>; }
export function canExportNatively(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && Boolean(requireOptionalNativeModule<ExportModule>('VidnivoExport'));
}
export async function exportMp4(project: Project, quality: 720 | 1080 = 1080): Promise<string> {
  const native = (Platform.OS === 'ios' || Platform.OS === 'android') ? requireOptionalNativeModule<ExportModule>('VidnivoExport') : null;
  if (!native) throw new Error('Native MP4 export requires a VIDNIVO development build, not Expo Go.');
  const preflight = exportPreflight(project, Platform.OS === 'android' ? 'android' : 'ios', quality);
  if (preflight.errors.length) throw new Error(preflight.errors.join(' '));
  const plan = createExportPlan(project, quality);
  return native.exportProject(JSON.stringify(plan));
}
export async function shareExport(uri: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share VIDNIVO video' });
}
