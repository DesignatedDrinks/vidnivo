/** Mobile editing viewport helpers. Pure functions, safe in Node tests. */
export function timelineGeometry(duration, viewportWidth=400){
 const safeDuration=Math.max(0,Number(duration)||0);
 const safeViewport=Math.max(200,Number(viewportWidth)||400);
 const pixelsPerSecond=safeDuration<=90?46:safeDuration<=300?26:Math.max(10,Math.min(26,7800/safeDuration));
 const width=Math.min(9000,Math.max(safeViewport,safeDuration*pixelsPerSecond));
 return {width,pixelsPerSecond:safeDuration>0?width/safeDuration:46,duration:safeDuration};
}
export function ticksForTimeline(duration){
 if(!Number.isFinite(duration)||duration<=0)return [{time:0,label:'00:00'}];
 const step=duration<=30?2:duration<=90?5:duration<=240?15:30;
 const count=Math.min(31,Math.ceil(duration/step)+1);
 return Array.from({length:count},(_,i)=>{
  const time=Math.min(duration,i*step);
  const min=Math.floor(time/60),sec=Math.floor(time%60);
  return {time,label:String(min).padStart(2,'0')+':'+String(sec).padStart(2,'0')};
 }).filter((item,index,arr)=>index===0||item.time>arr[index-1].time);
}
export function captionAtTime(captions,time){
 if(!Array.isArray(captions)||!Number.isFinite(time))return null;
 return captions.find(c=>c&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start<=time&&time<c.end)||null;
}
/** Split a *caption*, never the source footage. New segments preserve the exact original words. */
export function splitTimedCaption(caption,at,newId){
 if(!caption||!Number.isFinite(at)||at<=caption.start+.15||at>=caption.end-.15)
  throw Error('Position the playhead inside the selected caption.');
 const words=String(caption.text||'').trim().split(/\s+/).filter(Boolean);
 if(words.length<2)throw Error('This caption needs at least two words to split.');
 const ratio=(at-caption.start)/(caption.end-caption.start);
 const index=Math.max(1,Math.min(words.length-1,Math.round(words.length*ratio)));
 return [
  {...caption,text:words.slice(0,index).join(' '),end:at},
  {...caption,id:newId,start:at,text:words.slice(index).join(' ')}
 ];
}
export function timelineClipWidths(clips,pixelsPerSecond){
 if(!Array.isArray(clips))return [];
 return clips.map(c=>Math.max(20,(c.end-c.start)/Math.max(.1,c.speed)*pixelsPerSecond));
}
