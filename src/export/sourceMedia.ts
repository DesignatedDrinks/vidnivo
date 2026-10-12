import type {Project} from '../domain/timeline.ts';

/**
 * Cloud Sheet metadata includes a phone-local media URI, not media bytes.
 * Verify each referenced source is on this device before starting export,
 * rather than failing minutes into the native encoding job.
 */
export function assertAvailableSourceMedia(
 project:Project, fileExists:(uri:string)=>boolean):void {
 const byId=new Map(project.assets.map(a=>[a.id,a]));
 const seen=new Set<string>();
 for(const clip of project.clips){
  if(seen.has(clip.assetId))continue;
  seen.add(clip.assetId);
  const asset=byId.get(clip.assetId);
  if(!asset)throw Error('A timeline clip references media that is no longer in this project.');
  if(!asset.uri.startsWith('file://')||!fileExists(asset.uri)){
   const name=asset.filename || 'Unnamed media';
   throw Error('Missing source media: "'+name+'". Restore or re-import this file on this device before exporting. Google Sheets stores project metadata, not the original media.');
  }
 }
}
