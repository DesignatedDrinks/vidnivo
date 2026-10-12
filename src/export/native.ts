import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Project } from '../domain/timeline';
import { createExportPlan } from './plan';
import { exportPreflight } from './preflight';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { assertExportFileMetadata } from './fileCheck';
import { assertAvailableSourceMedia } from './sourceMedia';
import { assertPlayableExport,expectedExport,type NativeExportMetadata } from './qualityGate';

interface ExportModule {
 exportProject(payload: string): Promise<string>;
 inspectExport(uri:string):Promise<NativeExportMetadata>;
}
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
  // Source assets must never be deleted. Only the new owned output is eligible
  // for cleanup if inspection proves the renderer produced an invalid movie.
  try{
   assertExportFileMetadata(output,file.exists,file.size);
   if(typeof native.inspectExport!=='function')
    throw Error('This VIDNIVO development build is missing MP4 verification. Update the app before exporting.');
   const metadata=await native.inspectExport(output);
   assertPlayableExport(metadata,expectedExport(plan));
  }catch(error){
   // Fail closed: don't share or publish an invalid MP4.
   try{
    if(output.startsWith('file://')&&output.includes('/vidnivo-exports/')&&file.exists)
     file.delete();
   }catch{/* Keep the original export failure. */}
   throw error;
  }
  return output;
}
export async function shareExport(uri: string): Promise<void> {
  const file = new File(uri);
  assertExportFileMetadata(uri,file.exists,file.size);
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share VIDNIVO video' });
}
