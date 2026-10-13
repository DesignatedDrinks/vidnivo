/* Rollblink mobile editing shell: visual UI connected to the original editor.
   No rendering or export shortcuts; editing remains on the proven timeline path. */
import {timelineGeometry,ticksForTimeline,captionAtTime,splitTimedCaption} from './rollblink-mobile-timeline.js';
import {isSubtitleCaption} from './rollblink-caption-touch.js';

const clock=time=>{
 const sec=Math.max(0,Number(time)||0);
 return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(Math.floor(sec%60)).padStart(2,'0');
};

export function createRollblinkMobileShell(bridge){
 const {$,state,total,duration,sourceById,setTab,reset,pause,seekTimeline,
  selectCaptionForEditing,renderCaptions,renderTimeline,renderEditor,requestDraw,
  startExport,runAutoCaptions,toast,key,rbSave,applyVoicePolish}=bridge;
 let ready=false,geometry=timelineGeometry(0),lastContext='',currentTool='edit';
 const els={};
 const isSmall=()=>window.matchMedia('(max-width:770px)').matches;
 const byId=id=>$(id);
 function activeCaption(){
  const editing=state.captions.find(c=>c.id===state.editCaptionId);
  return editing||captionAtTime(state.captions.filter(isSubtitleCaption),state.position)||captionAtTime(state.captions,state.position);
 }
 function setTool(name){
  currentTool=name;
  document.querySelectorAll('[data-mobile-tool]').forEach(b=>{
   const on=b.dataset.mobileTool===name;
   b.classList.toggle('active',on);
   b.setAttribute('aria-pressed',String(on));
  });
 }
 function closePanels(){
  document.body.classList.remove('mobile-drawer-open');
  document.querySelector('.rb-tools')?.classList.remove('rb-open');
  document.querySelector('.autopilot-card')?.classList.remove('rb-open');
  els.audio.classList.remove('rb-open');
 }
 function openInspector(tab,tool=tab){
  closePanels();setTab(tab);setTool(tool);
  document.body.classList.add('mobile-drawer-open');
 }
 function openCreator(){
  closePanels();setTool('generate');
  document.querySelector('.rb-tools')?.classList.add('rb-open');
  document.body.classList.add('mobile-drawer-open');
 }
 function openAutopilot(){
  closePanels();setTool('edit');
  document.querySelector('.autopilot-card')?.classList.add('rb-open');
  document.body.classList.add('mobile-drawer-open');
 }
 function openAudio(){
  closePanels();setTool('audio');
  els.audio.classList.add('rb-open');
  els.muted.checked=Boolean(state.sourceMuted);
  els.polish.checked=Boolean(state.voicePolish);
  document.body.classList.add('mobile-drawer-open');
 }
 function refreshBusy(){
  if(!ready)return;
  const processing=Boolean(state.exporting||state.captioning||state.faceLoading||state.creatorBusy);
  const busy=!state.clips.length||processing;
  document.querySelectorAll('[data-mobile-tool]').forEach(button=>{button.disabled=processing});
  els.export.disabled=busy;
  els.mute.disabled=busy;
  byId('mobileAddCaption').disabled=busy;
  const ai=byId('mobileAIClips');if(ai)ai.disabled=busy;
  const cover=byId('mobileCover');if(cover)cover.disabled=busy;
 }
 function updatePosition(){
  if(!ready)return;
  const pos=Math.max(0,Math.min(total(),state.position));
  const x=pos*geometry.pixelsPerSecond;
  els.head.style.left=x+'px';
  els.current.textContent=clock(pos);
  els.total.textContent=clock(total());
  if(state.playing&&x>els.scroller.scrollLeft+els.scroller.clientWidth*.72)
   els.scroller.scrollLeft=Math.max(0,x-els.scroller.clientWidth*.52);
  const cap=activeCaption();
  const signature=(cap?.id||'none')+':'+(cap?.text||'')+':'+(cap?.start||0)+':'+(cap?.end||0);
  if(lastContext!==signature){
   lastContext=signature;
   els.caption.textContent=cap?.text||'Select a caption on the timeline';
   els.caption.classList.toggle('empty',!cap);
   els.capTime.textContent=cap?clock(cap.start)+' – '+clock(cap.end):clock(0)+' – '+clock(0);
   els.caption.setAttribute('title',cap?.text||'');
   els.track.querySelectorAll('.mobile-caption-chip').forEach(button=>{
    button.classList.toggle('active',button.dataset.captionId===cap?.id);
   });
  }
  const audio=byId('mobileOriginalAudio');
  audio?.classList.toggle('muted',Boolean(state.sourceMuted));
  els.mute.querySelector('span:last-child').textContent=state.sourceMuted?'Unmute audio':'Mute audio';
  els.mute.setAttribute('aria-pressed',String(Boolean(state.sourceMuted)));
 }
 function drawMobileThumbnails(clip,button){
  const source=sourceById(clip.sourceId);
  const list=source?.thumbnails||[];
  if(!list.length)return;
  const eligible=list.filter(t=>t.time>=clip.start-.15&&t.time<=clip.end+.15);
  const frames=eligible.length?eligible:list.slice(0,1);
  const track=document.createElement('div');
  track.className='mobile-clip-thumbnails';track.setAttribute('aria-hidden','true');
  const width=Math.ceil(Math.min(10000,(clip.end-clip.start)/Math.max(.1,clip.speed)*geometry.pixelsPerSecond));
  const desired=Math.min(120,Math.ceil(width/46));
  for(let i=0;i<desired;i++){
   const candidate=frames[Math.min(frames.length-1,Math.floor(i/Math.max(1,desired)*frames.length))];
   const img=document.createElement('img');img.alt='';img.src=candidate.src;
   img.decoding='async';img.loading='lazy';track.append(img);
  }
  button.prepend(track);
 }
 function refreshTimeline(){
  if(!ready)return;
  geometry=timelineGeometry(total(),Math.max(280,els.scroller.clientWidth-10));
  els.content.style.width=geometry.width+'px';
  els.ticks.replaceChildren();
  for(const tick of ticksForTimeline(total())){
   const span=document.createElement('span');
   span.textContent=tick.label;
   span.style.left=tick.time*geometry.pixelsPerSecond+'px';
   els.ticks.append(span);
  }
  const clips=[...byId('timeline').querySelectorAll('.clip')];
  for(const [index,button] of clips.entries()){
   const clip=state.clips[index];if(!clip)continue;
   button.style.flex='0 0 '+Math.max(20,duration(clip)*geometry.pixelsPerSecond-2)+'px';
   button.querySelector('.mobile-clip-thumbnails')?.remove();
   drawMobileThumbnails(clip,button);
  }
  refreshCaptions();refreshBusy();updatePosition();
 }
 function refreshCaptions(){
  if(!ready)return;
  els.track.replaceChildren();
  for(const cap of state.captions){
   const start=Math.max(0,Number(cap.start)||0),end=Math.min(total(),Number(cap.end)||0);
   if(!(end>start+.03))continue;
   const chip=document.createElement('button');chip.type='button';
   chip.className='mobile-caption-chip'+(isSubtitleCaption(cap)?'':' title');
   chip.dataset.captionId=cap.id;
   chip.style.left=start*geometry.pixelsPerSecond+'px';
   chip.style.width=Math.max(24,(end-start)*geometry.pixelsPerSecond-3)+'px';
   chip.textContent=cap.text;
   chip.setAttribute('aria-label','Edit caption: '+cap.text);
   chip.onclick=()=>{
    if(state.exporting||state.captioning)return;
    selectCaptionForEditing(cap,{seek:true});
    closePanels();setTool('captions');lastContext='';refreshCaptions();updatePosition();
   };
   els.track.append(chip);
  }
  lastContext='';updatePosition();
 }
 async function prepareThumbnails(source){
  if(!source||source.thumbnails||source.thumbnailing)return;
  source.thumbnailing=true;
  const v=document.createElement('video');v.preload='auto';v.playsInline=true;v.muted=true;
  v.src=source.url;
  try{
   await new Promise((resolve,reject)=>{
    if(v.readyState>=1){resolve();return}
    const timer=setTimeout(()=>{cleanup();reject(Error('Thumbnail metadata timeout'))},5000);
    function cleanup(){clearTimeout(timer);v.removeEventListener('loadedmetadata',done);v.removeEventListener('error',fail)}
    function done(){cleanup();resolve()}function fail(){cleanup();reject(Error('Unsupported thumbnail source'))}
    v.addEventListener('loadedmetadata',done);v.addEventListener('error',fail);
    v.load();
   });
   const count=Math.min(12,Math.max(5,Math.ceil(source.duration/3)));
   const frame=document.createElement('canvas');frame.width=64;frame.height=100;
   const fctx=frame.getContext('2d');
   const previews=[];
   for(let i=0;i<count;i++){
    if(!state.sources.includes(source))break;
    const wanted=Math.max(0,Math.min(source.duration-.12,(i+.5)/count*source.duration));
    await new Promise(resolve=>{
     let done=false;
     const timeout=setTimeout(finish,1100);
     function finish(){if(done)return;done=true;clearTimeout(timeout);v.removeEventListener('seeked',finish);resolve()}
     v.addEventListener('seeked',finish,{once:true});
     try{v.currentTime=wanted}catch{finish()}
    });
    if(v.readyState<2||!v.videoWidth||!v.videoHeight)continue;
    try{
     const zoom=Math.max(frame.width/v.videoWidth,frame.height/v.videoHeight);
     const w=v.videoWidth*zoom,h=v.videoHeight*zoom;
     fctx.drawImage(v,(frame.width-w)/2,(frame.height-h)/2,w,h);
     previews.push({time:wanted,src:frame.toDataURL('image/jpeg',.65)});
    }catch{}
   }
   if(state.sources.includes(source)&&previews.length){source.thumbnails=previews;refreshTimeline()}
  }catch{
   // Not all mobile decoders expose seekable offscreen frames; the track remains usable.
  }finally{
   source.thumbnailing=false;
   v.pause();v.removeAttribute('src');v.load();
  }
 }
 function setMute(muted){
  state.sourceMuted=Boolean(muted);
  if(!state.audioContext)bridge.video.muted=state.sourceMuted;
  else{bridge.video.muted=false;applyVoicePolish()}
  els.muted.checked=state.sourceMuted;
  updatePosition();rbSave();
 }
 function selectedCaption(){return activeCaption()}
 function contextAction(kind){
  const cap=selectedCaption();
  if(kind==='style'){
   openInspector('captions','captions');
   const box=document.querySelector('.rb-caption-fonts');
   box?.scrollIntoView({block:'nearest',behavior:'smooth'});return;
  }
  if(kind==='edit'){
   if(cap)selectCaptionForEditing(cap);
   openInspector('captions','captions');
   const input=byId('captionText');
   if(cap){input.value=cap.text;input.focus()}
   else{input.focus()}
   return;
  }
  if(kind==='auto'){openInspector('captions','captions');void runAutoCaptions();return}
  if(!cap){toast('Select a caption first.',true);return}
  if(state.exporting||state.captioning){toast('Finish the current processing step first.',true);return}
  if(kind==='split'){
   try{
    const [first,second]=splitTimedCaption(cap,state.position,key());
    const index=state.captions.findIndex(c=>c.id===cap.id);
    if(index<0)throw Error('Selected caption no longer exists.');
    state.captions.splice(index,1,first,second);
    state.editCaptionId=second.id;renderCaptions();renderTimeline();requestDraw();rbSave();
    toast('Caption split without changing video or speech timing.');
   }catch(error){toast(error.message||String(error),true)}
   return;
  }
  if(kind==='delete'){
   if(!window.confirm('Delete this caption? The video itself will not be changed.'))return;
   state.captions=state.captions.filter(c=>c.id!==cap.id);
   if(state.editCaptionId===cap.id)state.editCaptionId=null;
   renderCaptions();renderTimeline();requestDraw();rbSave();
  }
 }
 function navigateTool(name){
  if(name==='audio'){openAudio();return}
  if(name==='generate'){openCreator();return}
  if(name==='edit'){openInspector('edit','edit');return}
  if(name==='text'){
   openInspector('captions','text');byId('captionText').focus();return;
  }
  if(name==='captions'){openInspector('captions','captions');return}
  if(name==='effects'){openInspector('looks','effects');return}
  if(name==='overlay'){
   openInspector('export','overlay');
   document.querySelector('.watermark-settings')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
 }
 function mount(){
  if(ready)return;
  els.scroller=byId('mobileTimelineScroll');els.content=byId('mobileTimelineContent');
  els.ticks=byId('mobileTimelineTicks');els.track=byId('mobileCaptionTrack');
  els.head=byId('mobilePlayhead');els.current=byId('mobileCurrentTime');els.total=byId('mobileTotalTime');
  els.export=byId('mobileExport');els.mute=byId('mobileMute');
  els.caption=byId('mobileSelectedCaption');els.capTime=byId('mobileCaptionTime');
  els.audio=byId('mobileAudioPanel');els.muted=byId('mobileAudioMuted');els.polish=byId('mobileVoicePolish');
  if(Object.values(els).some(node=>!node))throw Error('Rollblink mobile editor markup is incomplete.');
  ready=true;
  byId('mobileClose').onclick=()=>{closePanels();reset()};
  byId('mobileExport').onclick=()=>{openInspector('export','edit');void startExport()};
  byId('mobileQuality').value=byId('quality').value;
  byId('mobileQuality').onchange=()=>{byId('quality').value=byId('mobileQuality').value};
  byId('mobileRatio').onchange=()=>bridge.setRatio(byId('mobileRatio').value);
  byId('mobileFit').onclick=()=>{
   document.body.classList.toggle('mobile-preview-expanded');
   byId('mobileFit').setAttribute('aria-pressed',String(document.body.classList.contains('mobile-preview-expanded')));
   bridge.drawFrame();
  };
  byId('mobileDrawerBackdrop').onclick=closePanels;
  byId('mobileEditSelected').onclick=()=>contextAction('edit');
  document.querySelectorAll('[data-mobile-context]').forEach(button=>
   button.onclick=()=>contextAction(button.dataset.mobileContext));
  document.querySelectorAll('[data-mobile-tool]').forEach(button=>
   button.onclick=()=>navigateTool(button.dataset.mobileTool));
  els.mute.onclick=()=>setMute(!state.sourceMuted);
  els.muted.onchange=()=>setMute(els.muted.checked);
  els.polish.onchange=()=>{
   state.voicePolish=els.polish.checked;applyVoicePolish();rbSave();
  };
  byId('mobileAddCaption').onclick=()=>contextAction('edit');
  const ai=byId('mobileAIClips');
  if(ai)ai.onclick=()=>{
   if(!state.clips.length){toast('Import a video before finding clips.',true);return}
   openCreator();
   const suggest=byId('rb-highlight');
   suggest?.scrollIntoView({block:'nearest'});
  };
  const cover=byId('mobileCover');if(cover)cover.onclick=()=>byId('rb-cover').click();
  els.scroller.addEventListener('click',event=>{
   if(event.target.closest('button'))return;
   const rect=els.content.getBoundingClientRect();
   const x=event.clientX-rect.left;
   if(x<0||!Number.isFinite(x))return;
   pause();void seekTimeline(Math.max(0,Math.min(total(),x/geometry.pixelsPerSecond)));
  });
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&isSmall()){closePanels()}
  });
  window.addEventListener('resize',()=>{
   if(!isSmall())closePanels();
   refreshTimeline();
  },{passive:true});
  refreshTimeline();updatePosition();
 }
 return {mount,refreshTimeline,refreshCaptions,updatePosition,refreshBusy,prepareThumbnails,closePanels};
}
