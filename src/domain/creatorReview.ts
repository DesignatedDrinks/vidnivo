import type {Project} from './timeline.ts';
import {clipEndMs} from './timeline.ts';
import {exportPreflight,type ExportPlatform} from '../export/preflight.ts';

export type ReviewSeverity='blocker'|'review'|'tip';
export interface CreatorIssue {id:string;severity:ReviewSeverity;title:string;detail:string;atMs:number|null}
export interface CreatorReview {issues:CreatorIssue[];blockers:number;reviews:number;tips:number;canExport:boolean}
const issue=(id:string,severity:ReviewSeverity,title:string,detail:string,atMs:number|null=null):CreatorIssue=>
 ({id,severity,title,detail,atMs});
/**
 * Structural preflight only. It does not claim to hear dialogue, judge
 * lighting, detect laughter or verify actual encoded audio/video.
 */
export function analyzeCreatorProject(project:Project,platform:ExportPlatform='ios',
 quality:720|1080=1080):CreatorReview {
 const issues:CreatorIssue[]=[];
 const preflight=exportPreflight(project,platform,quality);
 preflight.errors.forEach((message,i)=>issues.push(issue('export-'+i,'blocker',
  'Export cannot start',message)));
 preflight.warnings.forEach((message,i)=>issues.push(issue('export-warning-'+i,
  'review','Check export settings',message)));
 const visuals=project.clips.filter(c=>c.track==='video').sort((a,b)=>a.startMs-b.startMs);
 const end=Math.max(0,...visuals.map(clipEndMs));
 if(!visuals.length && !preflight.errors.length)issues.push(issue('empty','blocker',
  'No visual footage','Import a video or photo before exporting.'));
 if(visuals.length) {
  let previousEnd=0;
  for(let i=0;i<visuals.length;i++){
   const c=visuals[i];
   if(c.startMs-previousEnd>120 && issues.filter(a=>a.id.startsWith('blank')).length<5)
    issues.push(issue('blank-'+c.id,'review','Blank video gap',
      'There is an empty section between clips. Review the black frames before exporting.',Math.round(previousEnd)));
   if(previousEnd-c.startMs>120 && issues.filter(a=>a.id.startsWith('overlap')).length<5)
    issues.push(issue('overlap-'+c.id,'review','Overlapping primary clips',
      'Check which clip appears during the overlap; the current exporter does not support stacked visual transitions.',Math.round(c.startMs)));
   previousEnd=Math.max(previousEnd,clipEndMs(c));
  }
 }
 const captions=project.texts.filter(t=>t.role!=='title')
  .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 if(!captions.length && visuals.length)
  issues.push(issue('no-captions','tip','No spoken captions',
   'For dialogue-led videos, subtitles can improve accessibility. They are optional.'));
 let tooShort=0,tooLong=0,unsafe=0,outside=0,overlapping=0;
 for(let i=0;i<captions.length;i++){
  const c=captions[i];
  if(c.endMs-c.startMs<350)tooShort++;
  if(c.text.length>100)tooLong++;
  if(c.y<.18||c.y>.83)unsafe++;
  if(c.endMs>end+60)outside++;
  if(i>0&&c.startMs<captions[i-1].endMs-100)overlapping++;
 }
 if(tooShort)issues.push(issue('fast-captions','review','Captions may flash too quickly',
  tooShort+' subtitle(s) display for less than 0.35 seconds. Check readability.',captions.find(c=>c.endMs-c.startMs<350)?.startMs??null));
 if(tooLong)issues.push(issue('long-captions','review','Subtitles may be crowded',
  tooLong+' subtitle(s) contain more than 100 characters. Split them for easier reading.',
  captions.find(c=>c.text.length>100)?.startMs??null));
 if(unsafe)issues.push(issue('safe-zones','review','Check caption safe areas',
  unsafe+' subtitle(s) may overlap platform interface elements near the top or bottom of the frame.',
  captions.find(c=>c.y<.18||c.y>.83)?.startMs??null));
 if(outside)issues.push(issue('captions-past-end','review','Captions extend past footage',
  outside+' subtitle(s) end after the last visual frame. Review timing or trim them.',
  captions.find(c=>c.endMs>end+60)?.startMs??null));
 if(overlapping)issues.push(issue('caption-overlap','review','Overlapping subtitles',
  overlapping+' caption pair(s) overlap in time. Review timing and legibility.',
  captions.find((c,i)=>i>0&&c.startMs<captions[i-1].endMs-100)?.startMs??null));
 const sound=project.clips.filter(c=>c.track==='audio');
 if(sound.some(c=>c.startMs>=end+100) && visuals.length)
  issues.push(issue('audio-after-footage','review','Audio starts after the video ends',
   'At least one added sound clip begins beyond the final video frame.'));
 if(!issues.length)issues.push(issue('structural-ready','tip','Timeline checks passed',
  'No structural problems were detected. Review the actual video and audio before publishing.'));
 const blockers=issues.filter(i=>i.severity==='blocker').length;
 return {issues,blockers,reviews:issues.filter(i=>i.severity==='review').length,
  tips:issues.filter(i=>i.severity==='tip').length,canExport:blockers===0};
}
