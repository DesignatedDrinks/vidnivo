import type {Project} from '../domain/timeline.ts';

export type SupportAction='none'|'retry-save'|'restart-preview'|'set-export-720';
export interface SupportDiagnostics {
 platform:'ios'|'android'|'web';
 screen:'projects'|'editor'|'export'|'cloud'|'captions'|'audio'|'other';
 quality:720|1080;
 clipCount:number;
 mediaCount:number;
 missingSourceCount:number;
 saveFailed:boolean;
 exportSupported:boolean;
 cloudSignedIn:boolean;
}
export interface SupportDiagnosis {
 answer:string;
 action:SupportAction;
 category:'storage'|'media'|'export'|'playback'|'account'|'captions'|'audio'|'other';
 aiGenerated:boolean;
 available:boolean;
 autoApplied?:boolean;
}
export function collectSupportDiagnostics(
 project:Project|null,
 details:Pick<SupportDiagnostics,'platform'|'screen'|'quality'|'saveFailed'|'exportSupported'|'cloudSignedIn'>,
 sourceExists:(uri:string)=>boolean
):SupportDiagnostics{
 const used=new Set(project?.clips.map(c=>c.assetId)||[]);
 let missingSourceCount=0;
 for(const asset of project?.assets||[]){
  if(!used.has(asset.id))continue;
  try{if(!asset.uri.startsWith('file://')||!sourceExists(asset.uri))missingSourceCount++;}
  catch{missingSourceCount++;}
 }
 return {...details,clipCount:project?.clips.length||0,
  mediaCount:project?.assets.length||0,missingSourceCount};
}
export function localSupportDiagnosis(issue:string,d:SupportDiagnostics):SupportDiagnosis{
 const q=issue.toLowerCase();
 const base={aiGenerated:false,available:false};
 if(d.saveFailed||/(can't|cannot|not|failed|error).{0,30}sav(e|ing)/.test(q))
  return {...base,category:'storage',action:'retry-save',
   answer:'I can retry saving your local draft without changing any edits. If the phone is out of space, free some storage first.'};
 if(d.missingSourceCount)
  return {...base,category:'media',action:'none',
   answer:'Your timeline references media missing from this device. Restore the original files from VIDNIVO Cloud or re-import them. I will not erase the project.'};
 if(/(export|render|mp4)/.test(q))
  return {...base,category:'export',action:d.exportSupported?'set-export-720':'none',
   answer:d.exportSupported?'I can reduce export resolution to 720p for your next attempt. Clips and captions remain unchanged.':'This phone needs a VIDNIVO native build to export MP4; Expo Go cannot encode video.'};
 if(/(preview|play|freez|stuck|black screen)/.test(q))
  return {...base,category:'playback',action:'restart-preview',
   answer:'I can reset the preview player safely and leave the project timeline untouched.'};
 if(/(cloud|sign.?in|account|backup|restore|sync)/.test(q))
  return {...base,category:'account',action:'none',
   answer:'Use the same VIDNIVO Cloud account on both phones. Restore downloads original video and audio; Google Sheets alone does not.'};
 return {...base,category:'other',action:'none',
  answer:'Please describe what you tapped, what happened and what you expected. No project files have been modified.'};
}
export function safeSupportDiagnosis(raw:unknown,fallback:SupportDiagnosis):SupportDiagnosis{
 if(!raw||typeof raw!=='object')return fallback;
 const value=raw as Partial<SupportDiagnosis>;
 const actions:SupportAction[]=['none','retry-save','restart-preview','set-export-720'];
 const categories:SupportDiagnosis['category'][]=['storage','media','export','playback','account','captions','audio','other'];
 if(!actions.includes(value.action as SupportAction)||!categories.includes(value.category as any)||
  typeof value.answer!=='string'||!value.answer.trim()||value.answer.length>1200)
  return fallback;
 return {answer:value.answer,action:value.action!,category:value.category!,
  aiGenerated:value.aiGenerated===true,available:value.available===true};
}
