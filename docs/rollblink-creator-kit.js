/* Rollblink Creator Kit: testable, offline-first utilities. */
export const FONT_CHOICES=[
 ['Inter','Inter,Arial,sans-serif'],['Manrope','Manrope,Arial,sans-serif'],
 ['Outfit','Outfit,Arial,sans-serif'],['DM Sans','"DM Sans",Arial,sans-serif'],
 ['Space Grotesk','"Space Grotesk",Arial,sans-serif'],
 ['Plus Jakarta Sans','"Plus Jakarta Sans",Arial,sans-serif'],
 ['Anton','Anton,Impact,sans-serif'],['Oswald','Oswald,Impact,sans-serif'],
 ['Bebas Neue','"Bebas Neue",Impact,sans-serif'],
 ['Barlow Condensed','"Barlow Condensed",Arial,sans-serif'],
 ['Archivo Black','"Archivo Black",Arial,sans-serif'],
 ['Montserrat','Montserrat,Arial,sans-serif'],['Poppins','Poppins,Arial,sans-serif'],
 ['Raleway','Raleway,Arial,sans-serif'],['Lora','Lora,Georgia,serif'],
 ['Playfair Display','"Playfair Display",Georgia,serif'],
 ['DM Serif Display','"DM Serif Display",Georgia,serif'],
 ['Libre Baskerville','"Libre Baskerville",Georgia,serif'],
 ['IBM Plex Mono','"IBM Plex Mono",monospace'],['Space Mono','"Space Mono",monospace'],
 ['System','system-ui,sans-serif'],['Georgia','Georgia,serif'],
 ['Impact','Impact,sans-serif'],['Courier','"Courier New",monospace']
].map(([name,family])=>({id:name.toLowerCase().replace(/\W+/g,'-'),name,family}));
export const fontById=id=>FONT_CHOICES.find(f=>f.id===id)||FONT_CHOICES[0];
const clean=v=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
export const spokenCaptions=captions=>(Array.isArray(captions)?captions:[])
 .filter(c=>c&&c.origin!=='title'&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&clean(c.text))
 .slice().sort((a,b)=>a.start-b.start);
export const transcriptText=captions=>spokenCaptions(captions).map(c=>clean(c.text)).join(' ').slice(0,16000);
export function honestHook(captions){
 const list=spokenCaptions(captions).slice(0,24);
 if(!list.length)return '';
 return list.map((c,i)=>({text:clean(c.text),score:
  (/\b(why|how|mistake|never|learned|realized|first|truth|changed|but)\b/i.test(c.text)?4:0)+
  (String(c.text).includes('?')?2:0)+(clean(c.text).split(' ').length>=4?2:0)-i*.15}))
 .sort((a,b)=>b.score-a.score)[0].text.replace(/[.!?]+$/,'').slice(0,78);
}
export function draftSocialCopy(platform,captions){
 const transcript=transcriptText(captions);
 if(!transcript)throw Error('Generate or add spoken captions first.');
 const title=honestHook(captions);
 const body=transcript.slice(0,1000);
 const p=platform||'Instagram';
 const suffix=p==='YouTube Shorts'?'\n\n#Shorts':
  p==='LinkedIn'?'\n\nWhat has your experience been?':
  p==='Instagram'?'\n\nWhat do you think?':'';
 return {title,copy:title+'\n\n'+body+suffix,platform:p,mode:'transcript-draft'};
}
export const EDIT_DIRECTIONS={
 clean:{name:'Clean',look:'original',font:'inter',color:'#FFFFFF',size:1.05},
 punchy:{name:'Punchy',look:'vibrant',font:'anton',color:'#FFE178',size:1.20},
 editorial:{name:'Editorial',look:'cinematic',font:'playfair-display',color:'#FFFFFF',size:1.06}
};
export function applyDirection(captions,direction){
 const p=EDIT_DIRECTIONS[direction];if(!p)throw Error('Unknown edit direction.');
 return (Array.isArray(captions)?captions:[]).map(c=>c.origin==='title'?c:
  {...c,color:p.color,fontScale:p.size,fontId:p.font,position:'bottom',x:undefined,y:undefined});
}
export function inspectEdit({clips=[],captions=[],sources=[],duration=0,ratio='9:16'}={}){
 const problems=[];
 const add=(level,code,text)=>problems.push({level,code,text});
 if(!clips.length)add('error','NO_VIDEO','Import a video before exporting.');
 if(!Number.isFinite(duration)||duration<=0)add('error','BAD_DURATION','Video length is invalid.');
 const ids=new Set(sources.map(s=>s.id));
 for(const [i,c] of clips.entries()){
  if(!ids.has(c.sourceId))add('error','MISSING_SOURCE','Clip '+(i+1)+' is missing its source file.');
  if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start)add('error','BAD_CLIP','Clip '+(i+1)+' has invalid timing.');
 }
 const safe=spokenCaptions(captions);
 if(!safe.length)add('warning','NO_CAPTIONS','No spoken captions. Confirm this is intentional.');
 if(captions.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>duration+.05||c.end<=c.start))add('error','CAPTION_TIMING','A caption is outside the video timeline.');
 if(safe.some(c=>clean(c.text).length>100&&c.end-c.start<2))add('warning','DENSE_CAPTION','A lengthy caption may be too fast to read.');
 if(safe.some(c=>Number(c.y)>.86&&ratio==='9:16'))add('warning','SAFE_AREA','Text could be hidden behind social controls.');
 const ordered=safe.slice().sort((a,b)=>a.start-b.start);
 if(ordered.some((c,i)=>i>0&&ordered[i-1].end>c.start+.08&&(ordered[i-1].position||'bottom')===(c.position||'bottom')))add('warning','OVERLAP','Two captions overlap and may cover each other.');
 return {ok:!problems.some(p=>p.level==='error'),problems};
}
/* Only metadata is saved, never video files or blob URLs. */
export function projectSnapshot(state){
 return {version:2,savedAt:Date.now(),
  sources:state.sources.map(s=>({name:s.name,size:s.size,duration:s.duration})),
  clips:state.clips.map(c=>({sourceIndex:state.sources.findIndex(s=>s.id===c.sourceId),start:c.start,end:c.end,speed:c.speed})),
  captions:state.captions.map(c=>({text:c.text,start:c.start,end:c.end,position:c.position,color:c.color,fontScale:c.fontScale,fontId:c.fontId,origin:c.origin,x:c.x,y:c.y})),
  ratio:state.ratio,look:state.look,enhancement:state.enhancement||null,cameraMotion:state.cameraMotion||'off',voicePolish:Boolean(state.voicePolish),fontId:state.captionFontId||'inter'};
}
export function canRestoreSnapshot(snapshot,sources){
 return Boolean(snapshot&&snapshot.version===2&&Array.isArray(snapshot.sources)&&snapshot.sources.length>0&&
  snapshot.sources.length===sources.length&&snapshot.sources.every((s,i)=>
    s.name===sources[i].name&&s.size===sources[i].size&&Math.abs(s.duration-sources[i].duration)<.08));
}
export function hydrateSnapshot(snapshot,sources,makeId){
 if(!canRestoreSnapshot(snapshot,sources))throw Error('Re-import the original source file(s) first.');
 if(!Array.isArray(snapshot.clips)||!snapshot.clips.length)throw Error('Saved timeline is empty.');
 const clips=snapshot.clips.map(c=>{
  const source=sources[c.sourceIndex];
  if(!source||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>source.duration+.08||c.end<=c.start||!(c.speed>0))throw Error('Saved clip timing is invalid.');
  return {id:makeId(),sourceId:source.id,start:c.start,end:Math.min(c.end,source.duration),speed:c.speed};
 });
 const duration=clips.reduce((sum,c)=>sum+(c.end-c.start)/c.speed,0);
 const captions=(Array.isArray(snapshot.captions)?snapshot.captions:[]).filter(c=>
  c&&typeof c.text==='string'&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end<=duration+.05&&c.end>c.start)
  .slice(0,300).map(c=>({...c,id:makeId()}));
 return {clips,captions,ratio:['9:16','1:1','16:9'].includes(snapshot.ratio)?snapshot.ratio:'9:16',
  look:typeof snapshot.look==='string'?snapshot.look:'original',
  voicePolish:Boolean(snapshot.voicePolish),enhancement:snapshot.enhancement||null,cameraMotion:['off','subtle','dynamic'].includes(snapshot.cameraMotion)?snapshot.cameraMotion:'off',fontId:fontById(snapshot.fontId).id};
}

/** Choose a *continuous* spoken highlight. No discontinuous cuts: browser A/V stays in sync. */
export function selectContinuousHighlight(captions,duration,targetSeconds=30){
 if(!Number.isFinite(duration)||duration<targetSeconds+4)return null;
 const spoken=spokenCaptions(captions);
 if(spoken.length<3)return null;
 const length=Math.min(targetSeconds,duration);
 const candidates=spoken.filter(c=>c.start<=duration-length+.08);
 if(!candidates.length)return null;
 const ranked=candidates.map((entry,i)=>{
  const start=Math.max(0,Math.min(entry.start,duration-length));
  const within=spoken.filter(c=>c.start>=start&&c.start<start+length);
  const text=within.map(c=>c.text).join(' ');
  const useful=within.length;
  const density=Math.min(useful,14);
  const hook=(/\b(why|how|mistake|changed|learned|secret|important|never|but|realized)\b/i.test(entry.text)?3:0)
    +(String(entry.text).includes('?')?2:0);
  const ending=within.some(c=>/[.!?]\s*$/.test(c.text))?1:0;
  return {start:Math.round(start*100)/100,end:Math.round((start+length)*100)/100,
   score:density+hook+ending-i*.01,reason:'A continuous spoken section with a strong opening.'};
 }).sort((a,b)=>b.score-a.score||a.start-b.start);
 const winner=ranked[0];return winner&&{start:winner.start,end:winner.end,reason:winner.reason};
}
