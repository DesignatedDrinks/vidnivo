import {type Project,type Clip,duplicateProject,clipEndMs,validateProject} from './timeline.ts';
import {createExportPlan} from '../export/plan.ts';

export interface StoryMoment {
  id:string;startMs:number;endMs:number;preview:string;explanation:string;
  /** Optional AI editorial assessment of caption excerpts, not viral prediction. */
  aiScore?:number;
}
export interface StoryOptions {minMs?:number;maxMs?:number;limit?:number}
const finished=(text:string)=>/[.!?…]["'”’)]?$/.test(text.trim());
const visuallyCovered=(p:Project,start:number,end:number):boolean=>{
 const spans=p.clips.filter(c=>c.track==='video').sort((a,b)=>a.startMs-b.startMs);
 let cursor=start;
 for(const c of spans){
  const to=clipEndMs(c);
  if(to<=cursor)continue;
  if(c.startMs>cursor+33)return false;
  if(c.startMs<cursor-33 && c.startMs>=start)return false;
  cursor=Math.min(end,to);
  if(cursor>=end-33)return true;
 }
 return false;
};
/**
 * Deterministic transcript-bounded moment suggestions. This is not a
 * language model, emotional analysis or fake virality rating. Start just
 * after a completed sentence and end only on completed punctuation.
 */
export function proposeStoryMoments(p:Project,opts:StoryOptions={}):StoryMoment[] {
 const minMs=opts.minMs??12000,maxMs=opts.maxMs??60000,limit=opts.limit??8;
 if(!Number.isFinite(minMs)||!Number.isFinite(maxMs)||minMs<2000||
    maxMs<=minMs||maxMs>90000||!Number.isInteger(limit)||limit<1||limit>20)
  throw Error('Invalid Story Finder settings.');
 const subtitles=p.texts.filter(t=>t.role!=='title'&&t.text.trim())
  .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 if(!subtitles.length)return [];
 if(subtitles.length>3000)throw Error('Too many captions. Find moments in smaller sections.');
 const moments:StoryMoment[]=[];
 for(let i=0;i<subtitles.length;i++){
  if(i>0&&!finished(subtitles[i-1].text))continue;
  const start=subtitles[i].startMs;
  let endIndex=-1;
  for(let j=i;j<subtitles.length;j++){
   if(subtitles[j].endMs-start>maxMs)break;
   if(subtitles[j].endMs-start>=minMs && finished(subtitles[j].text)){
    endIndex=j;break;
   }
  }
  if(endIndex<0)continue;
  const end=subtitles[endIndex].endMs;
  if(!visuallyCovered(p,start,end))continue;
  const tooSimilar=moments.some(item=>{
   const overlap=Math.max(0,Math.min(item.endMs,end)-Math.max(item.startMs,start));
   return overlap/Math.min(item.endMs-item.startMs,end-start)>.75;
  });
  if(tooSimilar)continue;
  const excerpt=subtitles.slice(i,Math.min(endIndex+1,i+6)).map(c=>c.text.trim()).join(' ');
  moments.push({id:'moment:'+start+':'+end,startMs:start,endMs:end,
   preview:excerpt.length>200?excerpt.slice(0,197)+'…':excerpt,
   explanation:'Starts after a sentence boundary and ends on a complete thought.'});
  if(moments.length>=limit)break;
 }
 return moments;
}
/**
 * Builds an independent, editable, portable-for-this-device short.
 * Reuses the source files but never modifies the original project.
 */
export function createStoryShort(original:Project,moment:StoryMoment):Project {
 validateProject(original);
 const {startMs:start,endMs:end}=moment;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<1000||end-start>90000)
  throw Error('Invalid short-video range.');
 if(!visuallyCovered(original,start,end))
  throw Error('The moment contains an unsupported gap or overlapping visual clips.');
 const copy=duplicateProject(original);
 const clips:Clip[]=[];
 for(let i=0;i<original.clips.length;i++){
  const source=original.clips[i];
  const from=Math.max(source.startMs,start);
  const to=Math.min(clipEndMs(source),end);
  if(to-from<250)continue;
  const target=copy.clips[i];
  const inMs=Math.round(source.inMs+(from-source.startMs)*source.speed);
  const outMs=Math.round(source.inMs+(to-source.startMs)*source.speed);
  if(outMs-inMs<250*source.speed)continue;
  clips.push({...target,startMs:Math.round(from-start),inMs,outMs});
 }
 const texts=copy.texts.flatMap((target,i)=>{
  const source=original.texts[i];
  const from=Math.max(source.startMs,start);
  const to=Math.min(source.endMs,end);
  if(to-from<250)return [];
  return [{...target,startMs:Math.round(from-start),endMs:Math.round(to-start)}];
 });
 const project:Project={...copy,name:original.name+' — Story Short',
  clips,texts,look:original.look?{...original.look}:undefined};
 validateProject(project);
 createExportPlan(project);
 return project;
}
