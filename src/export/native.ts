import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Project } from '../domain/timeline';
import { createExportPlan } from './plan';
import { exportPreflight } from './preflight';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { assertExportFileMetadata } from './fileCheck';
import { assertAvailableSourceMedia } from './sourceMedia';

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
  assertAvailableSourceMedia(project, uri => new File(uri).exists);
  const output = await native.exportProject(JSON.stringify(plan));
  const file = new File(output);
  assertExportFileMetadata(output, file.exists, file.size);
  return output;
}
export async function shareExport(uri: string): Promise<void> {
  const file = new File(uri);
  assertExportFileMetadata(uri,file.exists,file.size);
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share VIDNIVO video' });
}
