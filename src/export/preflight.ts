import type {Project} from '../domain/timeline.ts';
import {createExportPlan, type ExportPlan} from './plan.ts';
export type ExportPlatform='ios'|'android';
export interface ExportPreflight { errors:string[]; warnings:string[]; plan:ExportPlan|null }
/**
 * Surfaces unsupported combinations before starting a costly native render.
 * The native encoders still independently validate and fail safely.
 */
export function exportPreflight(project:Project,platform:ExportPlatform,quality:720|1080=1080):ExportPreflight {
  const errors:string[]=[],warnings:string[]=[];
  let plan:ExportPlan|null=null;
  try {plan=createExportPlan(project,quality);} catch(e) {
    errors.push(e instanceof Error?e.message:String(e));
    return {errors,warnings,plan};
  }
  if(platform==='android'){
    for(const clip of plan.clips){
      if(!clip.muted && Math.abs(clip.volume-1)>0.01){
        errors.push('Android MP4 export currently supports 100% volume or mute. Set the clip volume to 100% before exporting.');
        break;
      }
    }
  }
  if (plan.clips.some(c => c.track==='audio' && c.speed>2 && !c.muted))
    warnings.push('Some music or voiceovers exceed 2× speed. The mobile audio preview is limited to 2×, so listen to the rendered MP4 to confirm synchronization.');
  if(plan.durationMs>8*60*1000)warnings.push('Long exports can use substantial storage and may take several minutes.');
  if(plan.texts.length>1000)warnings.push('Large caption tracks can render slowly.');
  return {errors,warnings,plan};
}
