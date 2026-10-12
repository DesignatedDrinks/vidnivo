/** VIDNIVO Creator Autopilot: a practical 30-second video finishing workflow.
 * Presets and custom styles are explicitly deterministic, not "AI magic".
 * No network requests, tracking or cloud persistence.
 */
export const STYLE_KEY='vidnivo:creator-style:v1';
export const STYLES={
 talking:{name:'On Camera',ratio:'9:16',look:'warm',size:1.14,x:.5,y:.70,color:'#FFFFFF',enhance:true,voice:true,retouch:0},
 product:{name:'Product Demo',ratio:'9:16',look:'vibrant',size:1.08,x:.5,y:.76,color:'#FFE178',enhance:true,voice:true,retouch:0},
 story:{name:'Story Mode',ratio:'9:16',look:'cinematic',size:1.24,x:.5,y:.72,color:'#FFFFFF',enhance:true,voice:true,retouch:0}
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const VALID_LOOKS=new Set(['original','vibrant','cinematic','warm','cool','vintage','mono','moody']);
const COLORS=new Set(['#FFFFFF','#23D4E9','#FFE178']);
export function normalizeStyle(candidate){
 if(!candidate||typeof candidate!=='object')throw Error('Saved style is invalid.');
 return {
  name:String(candidate.name||'My Style').replace(/[^\w -]/g,'').slice(0,32),
  ratio:['9:16','1:1','16:9'].includes(candidate.ratio)?candidate.ratio:'9:16',
  look:VALID_LOOKS.has(candidate.look)?candidate.look:'warm',
  size:Number.isFinite(Number(candidate.size))?clamp(Number(candidate.size),.55,2.4):1.14,
  x:Number.isFinite(Number(candidate.x))?clamp(Number(candidate.x),.12,.88):.5,
  y:Number.isFinite(Number(candidate.y))?clamp(Number(candidate.y),.15,.85):.70,
  color:COLORS.has(candidate.color)?candidate.color:'#FFFFFF',
  enhance:Boolean(candidate.enhance),voice:Boolean(candidate.voice),
  retouch:Number.isFinite(Number(candidate.retouch))?clamp(Number(candidate.retouch),0,60):0
 };
}
export function getStyle(key,custom){
 if(key==='custom'){
  if(!custom)throw Error('No saved My Style exists yet. Use Save My Style first.');
  return normalizeStyle(custom);
 }
 if(!Object.prototype.hasOwnProperty.call(STYLES,key))throw Error('Select a finishing style.');
 return normalizeStyle(STYLES[key]);
}
export function saveStyle(store,style){
 const normalized=normalizeStyle(style);
 store.setItem(STYLE_KEY,JSON.stringify(normalized));
 return normalized;
}
export function loadStyle(store){
 try{
  const raw=store.getItem(STYLE_KEY);
  return raw?normalizeStyle(JSON.parse(raw)):null;
 }catch{return null}
}
export function styleCaptions(captions,style){
 const clean=normalizeStyle(style);
 return captions.map(c=>{
  if(c.origin!=='auto')return c; // Never overwrite finger-placed handmade captions.
  return {...c,position:'custom',x:clean.x,y:clean.y,fontScale:clean.size,color:clean.color};
 });
}
/**
 * Only trims silence at the START and END of one continuous clip, using
 * speech detection timestamps. Never produces internal cuts because the
 * browser's real-time A/V exporter cannot safely join discontinuities.
 */
export function planSpeechEdgeTrim({duration,firstSpeech,lastSpeech,pad=.25,maxEdge=4}){
 if(![duration,firstSpeech,lastSpeech].every(Number.isFinite)||duration<2||
    firstSpeech<0||lastSpeech<=firstSpeech||lastSpeech>duration+.25)
  return {valid:false,front:0,back:0,newDuration:duration,reason:'Invalid speech times'};
 const limit=Math.min(maxEdge,duration*.2);
 const front=clamp(firstSpeech-pad,0,limit);
 const back=clamp(duration-lastSpeech-pad,0,limit);
 const cutStart=front>=.35?front:0;
 const cutEnd=back>=.35?back:0;
 if(duration-cutStart-cutEnd<1.75)
  return {valid:false,front:0,back:0,newDuration:duration,reason:'Too short after trimming'};
 return {valid:true,front:Math.round(cutStart*100)/100,back:Math.round(cutEnd*100)/100,
  newDuration:Math.round((duration-cutStart-cutEnd)*100)/100};
}
export function shiftTimedCaptions(captions,front,newDuration){
 if(!Array.isArray(captions)||!Number.isFinite(front)||!Number.isFinite(newDuration))
  return [];
 return captions.map(c=>({
  ...c,
  start:clamp(Number(c.start)-front,0,newDuration),
  end:clamp(Number(c.end)-front,0,newDuration)
 })).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start+.08);
}

/** Generate honest on-screen hook suggestions from phrases actually spoken.
 * No fabricated claims, no external AI API, and no voice replacement.
 */
export function suggestOpeningHooks(captions,limit=3){
 if(!Array.isArray(captions))return [];
 const candidates=captions.filter(c=>c.origin==='auto'&&Number.isFinite(c.start)
  &&c.start<20&&typeof c.text==='string').slice(0,30);
 const scored=candidates.map((c,index)=>{
  const text=c.text.replace(/\s+/g,' ').trim();
  const words=text.split(' ');
  if(words.length<3||words.length>18||text.length>90)return null;
  const short=text.replace(/[.!?]+$/,'').trim();
  const scoring=(/\b(how|why|what|would|can|could|did|should|ever)\b/i.test(text)?4:0)
    +(/\b(but|instead|never|stop|before|secret|mistake|biggest|actually|surprise|truth|real)\b/i.test(text)?3:0)
    +(/\b\d+\b/.test(text)?2:0)
    +(text.includes('?')?3:0)
    +(words.length>=5&&words.length<=12?2:0)
    +(Math.max(0,3-index*.25));
  return {text:short,score:scoring,time:c.start};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.time-b.time);
 const seen=new Set(),output=[];
 for(const c of scored){
  const key=c.text.toLowerCase();
  if(seen.has(key))continue;
  seen.add(key);output.push({text:c.text,time:c.time});
  if(output.length>=limit)break;
 }
 return output;
}
