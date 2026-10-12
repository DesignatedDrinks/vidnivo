import {type Project, type Clip, makeId, clipDurationMs} from './timeline.ts';
import type {RecognizedWord} from './captions.ts';

export interface KeepSegment { inMs: number; outMs: number }
export interface SilenceRemovalPlan { segments: KeepSegment[]; savedMs: number; originalInMs: number; originalOutMs: number }
/**
 * Conservative pause detection: keep 180ms around each recognized word and
 * remove only gaps exceeding a configured minimum (default 0.85 sec).
 * Source audio remains attached to retained video segments.
 */
export function planSilenceRemoval(clip: Clip, words: RecognizedWord[],
  minPauseMs = 850, paddingMs = 180): SilenceRemovalPlan | null {
  if(!Number.isFinite(clip.speed)||clip.speed<=0)throw Error('Invalid playback speed.');
  if(minPauseMs<400)throw Error('Minimum pause must be at least 400ms.');
  const filtered=words.filter(w=>Number.isFinite(w.startMs)&&Number.isFinite(w.endMs) &&
    w.endMs>w.startMs && w.endMs>clip.inMs && w.startMs<clip.outMs)
    .sort((a,b)=>a.startMs-b.startMs);
  if(!filtered.length)return null;
  const ranges: KeepSegment[]=[];
  for(const word of filtered){
    const start=Math.max(clip.inMs,word.startMs-paddingMs);
    const end=Math.min(clip.outMs,word.endMs+paddingMs);
    const prev=ranges[ranges.length-1];
    if(prev && start-prev.outMs<minPauseMs){
      prev.outMs=Math.max(prev.outMs,end);
    }else{
      ranges.push({inMs:start,outMs:end});
    }
  }
  const retainedMs=ranges.reduce((sum,s)=>sum+s.outMs-s.inMs,0);
  const savedMs=Math.round((clip.outMs-clip.inMs-retainedMs)/clip.speed);
  if(savedMs<Math.round(minPauseMs/clip.speed/2))return null;
  return {segments:ranges,savedMs,originalInMs:clip.inMs,originalOutMs:clip.outMs};
}
export function applySilenceRemoval(p: Project,id: string,plan: SilenceRemovalPlan): Project {
  const clip=p.clips.find(c=>c.id===id);
  if(!clip || clip.track!=='video')return p;
  if(p.texts.length || p.clips.some(c=>c.track==='audio'))
    throw Error('Remove pauses before adding captions and separate soundtracks.');
  if(clip.inMs!==plan.originalInMs || clip.outMs!==plan.originalOutMs ||
     !plan.segments.length)throw Error('Clip changed after pause detection. Scan it again.');
  let prevEnd=clip.inMs, cursor=clip.startMs;
  const pieces: Clip[]=[];
  for(const [i,segment] of plan.segments.entries()){
    if(!Number.isFinite(segment.inMs)||!Number.isFinite(segment.outMs) ||
       segment.inMs<prevEnd-0.001 || segment.outMs>clip.outMs ||
       segment.outMs-segment.inMs<50)throw Error('Invalid cut interval.');
    const item={...clip,id:i===0?clip.id:makeId(),startMs:Math.round(cursor),
      inMs:Math.round(segment.inMs),outMs:Math.round(segment.outMs)};
    pieces.push(item);
    cursor+=clipDurationMs(item);
    prevEnd=segment.outMs;
  }
  const originalEnd=clip.startMs+clipDurationMs(clip);
  const shift=cursor-originalEnd;
  const clips=p.clips.flatMap(c=>{
    if(c.id===id)return pieces;
    if(c.track==='video' && c.startMs>=originalEnd-.01)
      return [{...c,startMs:Math.max(0,Math.round(c.startMs+shift))}];
    return [c];
  });
  return {...p,clips,revision:p.revision+1,updatedAt:new Date().toISOString()};
}
