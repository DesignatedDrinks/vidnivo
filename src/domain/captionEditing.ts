import { type Project, type TextLayer, makeId } from './timeline.ts';

function updated(p: Project, texts: TextLayer[]): Project {
  return { ...p, texts, revision:p.revision+1, updatedAt:new Date().toISOString() };
}
/**
 * Splits text approximately in the middle while distributing existing caption
 * duration in proportion to the word count. No nearby caption times change.
 */
export function splitCaption(p: Project, id: string): Project {
  const target = p.texts.find(t=>t.id===id);
  if (!target) return p;
  const words=target.text.trim().split(/\s+/);
  if (words.length<2 || target.endMs-target.startMs<400) return p;
  const index=Math.floor(words.length/2);
  const left=words.slice(0,index).join(' ');
  const right=words.slice(index).join(' ');
  const duration=target.endMs-target.startMs;
  const halfway=Math.max(target.startMs+200,Math.min(target.endMs-200,
    target.startMs+Math.round(duration*index/words.length)));
  const one={...target,text:left,endMs:halfway};
  const two={...target,id:makeId(),text:right,startMs:halfway};
  return updated(p,p.texts.flatMap(t=>t.id===id?[one,two]:[t]));
}
/** Merges the next caption in timeline order, retaining the leading style. */
export function mergeCaptionWithNext(p: Project, id: string): Project {
  const source=p.texts.find(t=>t.id===id);
  if(!source)return p;
  const next=p.texts.filter(t=>t.id!==id && t.startMs>=source.startMs)
    .sort((a,b)=>a.startMs-b.startMs)[0];
  if(!next || next.startMs>source.endMs+1000)return p;
  return updated(p,p.texts.filter(t=>t.id!==next.id).map(t=>t.id===id?
    {...t,text:t.text.trim()+' '+next.text.trim(),endMs:Math.max(t.endMs,next.endMs)}:t));
}
export function nudgeCaption(p: Project,id: string,deltaMs: number): Project {
  if(!Number.isFinite(deltaMs) || deltaMs===0) return p;
  const target=p.texts.find(t=>t.id===id);
  if(!target)return p;
  const offset=Math.max(-target.startMs,Math.round(deltaMs));
  if(offset===0)return p;
  return updated(p,p.texts.map(t=>t.id===id?
    {...t,startMs:t.startMs+offset,endMs:t.endMs+offset}:t));
}
/** Moves every caption without changing individual durations. */
export function shiftAllCaptions(p: Project,deltaMs: number): Project {
  if(!p.texts.length || !Number.isFinite(deltaMs) || deltaMs===0)return p;
  const earliest=Math.min(...p.texts.map(t=>t.startMs));
  const offset=Math.max(-earliest,Math.round(deltaMs));
  if(offset===0)return p;
  return updated(p,p.texts.map(t=>({...t,startMs:t.startMs+offset,endMs:t.endMs+offset})));
}
/** Only capitalizes clear sentence boundaries; acronyms and existing casing are preserved. */
export function fixSentenceCase(p: Project): Project {
  if(!p.texts.length)return p;
  let capitalize=true;
  let changed=false;
  const next=p.texts.map(t=>{
    const original=t.text;
    let word='';
    for(const char of original){
      if(capitalize && /[a-zA-Z]/.test(char)) {word+=char.toUpperCase();capitalize=false;}
      else {word+=char;}
      if(/[.!?]/.test(char))capitalize=true;
    }
    changed=changed || word!==original;
    return {...t,text:word};
  });
  return changed?updated(p,next):p;
}
