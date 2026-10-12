import type {StoryMoment} from './storyMoments.ts';
export interface RankedStoryMoment {id:string;reason:string;score:number}
/** Only reorder verified local candidates. An AI response cannot invent a
 * source range, edit a video or change timestamps.
 */
export function applyAiMomentRanking(
 originals:StoryMoment[],raw:unknown):StoryMoment[]{
 if(!raw||typeof raw!=='object'||!(raw as any).aiRanked||
  !Array.isArray((raw as any).rankings))throw Error('AI moment ranking is unavailable.');
 const values=(raw as any).rankings as RankedStoryMoment[];
 if(values.length!==originals.length)throw Error('Incomplete AI candidate ranking.');
 const originalById=new Map(originals.map(x=>[x.id,x]));
 if(originalById.size!==originals.length)throw Error('Duplicate source moment.');
 const used=new Set<string>();
 return values.map(item=>{
  const source=originalById.get(item?.id);
  if(!source||used.has(item.id)||!Number.isInteger(item.score)||
    item.score<0||item.score>100||typeof item.reason!=='string'||
    item.reason.length<5||item.reason.length>160)
   throw Error('AI returned a recommendation outside this project.');
  used.add(item.id);
  return {...source,aiScore:item.score,explanation:item.reason};
 });
}
