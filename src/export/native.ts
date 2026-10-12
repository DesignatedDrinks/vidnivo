import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Project } from '../domain/timeline';
import { createExportPlan } from './plan';
import * as Sharing from 'expo-sharing';

interface ExportModule { exportProject(payload: string): Promise<string>; }
export function canExportNatively(): boolean {
  return Platform.OS === 'ios' && Boolean(requireOptionalNativeModule<ExportModule>('VidnivoExport'));
}
export async function exportMp4(project: Project, quality: 720 | 1080 = 1080): Promise<string> {
  const native = Platform.OS === 'ios' ? requireOptionalNativeModule<ExportModule>('VidnivoExport') : null;
  if (!native) throw new Error('Native MP4 export requires the iOS development build, not Expo Go.');
  const plan = createExportPlan(project, quality);
  return native.exportProject(JSON.stringify(plan));
}
export async function shareExport(uri: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share VIDNIVO video' });
}
