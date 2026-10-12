import {type Project,type Clip,clipDurationMs} from './timeline.ts';
import {applySilenceRemoval,type KeepSegment,type SilenceRemovalPlan} from './silenceCuts.ts';
import type {RecognizedWord} from './captions.ts';

export interface SpeechGap {
  id:string;clipId:string;fromMs:number;toMs:number;timelineMs:number;savesMs:number;
}
export interface SpeechGapOptions {minGapMs?:number;edgePaddingMs?:number}
/**
 * Speech recognition cannot distinguish a quiet pause from laughter, reaction,
 * music or applause. These are *proposals*, never evidence of actual silence.
 * Only internal gaps are considered; the beginning and ending are protected.
 */
export function proposeSpeechGaps(clip:Clip,words:RecognizedWord[],
 options:SpeechGapOptions={}):SpeechGap[] {
 const minGapMs=options.minGapMs??950;
 const edgePaddingMs=options.edgePaddingMs??220;
 if(!Number.isFinite(minGapMs)||minGapMs<600||minGapMs>10000||
    !Number.isFinite(edgePaddingMs)||edgePaddingMs<100||edgePaddingMs>1000)
   throw Error('Invalid pause review settings.');
 if(clip.track!=='video'||!Number.isFinite(clip.speed)||clip.speed<=0)return [];
 const speech=words.filter(w=>w.text?.trim()&&Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)
  &&w.endMs>w.startMs &&w.endMs>clip.inMs &&w.startMs<clip.outMs)
  .map(w=>({startMs:Math.max(clip.inMs,w.startMs),endMs:Math.min(clip.outMs,w.endMs)}))
  .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 if(speech.length<2)return [];
 const merged:typeof speech=[];
 for(const span of speech){
  const previous=merged[merged.length-1];
  if(previous&&span.startMs<=previous.endMs+1) previous.endMs=Math.max(previous.endMs,span.endMs);
  else merged.push({...span});
 }
 const proposed:SpeechGap[]=[];
 for(let i=1;i<merged.length;i++){
  const left=merged[i-1],right=merged[i];
  if(right.startMs-left.endMs<minGapMs)continue;
  const start=Math.max(clip.inMs+250*clip.speed,left.endMs+edgePaddingMs);
  const end=Math.min(clip.outMs-250*clip.speed,right.startMs-edgePaddingMs);
  const savesMs=Math.round((end-start)/clip.speed);
  if(!Number.isFinite(savesMs)||savesMs<450)continue;
  const fromMs=Math.ceil(start),toMs=Math.floor(end);
  if(toMs<=fromMs)continue;
  proposed.push({id:clip.id+':'+fromMs+':'+toMs,clipId:clip.id,
   fromMs,toMs,timelineMs:Math.round(clip.startMs+(fromMs-clip.inMs)/clip.speed),
   savesMs:Math.round((toMs-fromMs)/clip.speed)});
  if(proposed.length>60)throw Error('Too many proposed cuts. Process this video in shorter sections.');
 }
 return proposed;
}
export function estimateApprovedSavings(proposals:SpeechGap[],selectedIds:ReadonlySet<string>):number {
 return proposals.filter(c=>selectedIds.has(c.id)).reduce((total,c)=>total+c.savesMs,0);
}
/** Apply only the clips explicitly approved by the user, in one undoable edit.
 * No underlying audio activity is assumed absent in transcript gaps.
 */
export function applyReviewedSpeechGaps(p:Project,clipId:string,proposals:SpeechGap[],
 selectedIds:ReadonlySet<string>):Project {
 if(!selectedIds.size)return p;
 const clip=p.clips.find(c=>c.id===clipId);
 if(!clip||clip.track!=='video')throw Error('The selected video no longer exists.');
 if(p.texts.length||p.clips.some(c=>c.track==='audio'))
  throw Error('Apply speech cuts before adding captions, music, or separate audio to prevent synchronization loss.');
 if(proposals.some(g=>g.clipId!==clipId))throw Error('Cut proposal belongs to a different clip.');
 const ids=new Set(proposals.map(g=>g.id));
 if(selectedIds.size>proposals.length||[...selectedIds].some(id=>!ids.has(id)))
  throw Error('One or more selected cut proposals are invalid. Scan this clip again.');
 const approved=proposals.filter(g=>selectedIds.has(g.id))
  .sort((a,b)=>a.fromMs-b.fromMs);
 const segments:KeepSegment[]=[];
 let cursor=clip.inMs;
 for(const cut of approved){
  if(!Number.isFinite(cut.fromMs)||!Number.isFinite(cut.toMs)||
     cut.id!==clip.id+':'+cut.fromMs+':'+cut.toMs||
     cut.fromMs-cursor<250*clip.speed||cut.toMs<=cut.fromMs||
     cut.toMs>clip.outMs-250*clip.speed)
    throw Error('Proposed cuts are stale or too close together. Review the clip again.');
  segments.push({inMs:cursor,outMs:cut.fromMs});
  cursor=cut.toMs;
 }
 if(clip.outMs-cursor<250*clip.speed)throw Error('A cut would leave an unusably short segment.');
 segments.push({inMs:cursor,outMs:clip.outMs});
 const savedMs=Math.round(clipDurationMs(clip)-segments.reduce((n,c)=>n+(c.outMs-c.inMs)/clip.speed,0));
 const plan:SilenceRemovalPlan={segments,savedMs,originalInMs:clip.inMs,originalOutMs:clip.outMs};
 return applySilenceRemoval(p,clipId,plan);
}
