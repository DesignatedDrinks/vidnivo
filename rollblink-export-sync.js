/*
 * ROLLBLINK real-time export synchronization guard.
 * A browser MediaRecorder is NOT a timeline encoder. The only reliable
 * real-time browser route is one continuous video at original speed.
 * This module explicitly blocks edits requiring discontinuous playback
 * and checks source-clock drift and encoded mux tracks before download.
 */
const abs=Math.abs;
export const SYNC_MAX_DRIFT_MS=230;
export const SYNC_MAX_DURATION_ERROR_MS=300;
export function planContinuousExport(clips){
 if(!Array.isArray(clips)||!clips.length)
  return {ok:false,reason:'Import a video first.'};
 const first=clips[0];
 if(!first||!Number.isFinite(first.start)||!Number.isFinite(first.end)||!first.sourceId)
  return {ok:false,reason:'The timeline contains an invalid clip.'};
 let cursor=first.start;
 for(const c of clips){
  if(c.sourceId!==first.sourceId||!Number.isFinite(c.start)||!Number.isFinite(c.end)
     ||c.end<=c.start||c.start<0)
   return {ok:false,reason:'Audio-safe web export requires one continuous source video. Multi-source editing needs the native exporter.'};
  if(abs(Number(c.speed)-1)>.0001)
   return {ok:false,reason:'Audio-safe web export currently requires 1× playback speed. Speed effects need the native exporter.'};
  if(abs(c.start-cursor)>.025)
   return {ok:false,reason:'Audio-safe web export requires contiguous footage. Skipped or reordered cuts need the native exporter.'};
  cursor=c.end;
 }
 const duration=cursor-first.start;
 if(!Number.isFinite(duration)||duration<=.19||duration>600)
  return {ok:false,reason:'Video must be between 0.2 seconds and 10 minutes.'};
 return {ok:true,sourceId:first.sourceId,start:first.start,end:cursor,duration,
   clip:{id:first.id,sourceId:first.sourceId,start:first.start,end:cursor,speed:1}};
}

export class PlaybackSyncGuard {
 constructor({start,expectedDuration,thresholdMs=SYNC_MAX_DRIFT_MS}){
  this.start=start;this.expectedDuration=expectedDuration;this.thresholdMs=thresholdMs;
  this.originNow=null;this.originMedia=null;this.lastNow=null;this.lastMedia=null;
  this.maxDriftMs=0;this.samples=0;
 }
 sample({now,mediaTime,paused=false}){
  if(!Number.isFinite(now)||!Number.isFinite(mediaTime))
   throw Error('Source video timing is unavailable; export stopped to protect lip sync.');
  if(paused)throw Error('Video playback stopped while recording; refusing an unsynchronized export.');
  if(this.originNow===null){
   this.originNow=now;this.originMedia=mediaTime;
  }
  if(mediaTime<this.start-.08||mediaTime>this.start+this.expectedDuration+.15)
   throw Error('Video audio and image position moved outside the edited timeline.');
  if(this.lastNow!==null&&now>this.lastNow+1400)
   throw Error('Export renderer stalled. The audio and picture may no longer match.');
  if(this.lastMedia!==null&&mediaTime+.045<this.lastMedia)
   throw Error('Source playback jumped backwards; export synchronization was lost.');
  const wallElapsed=(now-this.originNow)/1000;
  const mediaElapsed=mediaTime-this.originMedia;
  const driftMs=1000*abs(wallElapsed-mediaElapsed);
  this.maxDriftMs=Math.max(this.maxDriftMs,driftMs);
  this.samples++;
  this.lastNow=now;this.lastMedia=mediaTime;
  if(wallElapsed>.35&&driftMs>this.thresholdMs)
   throw Error('Lip-sync drift detected ('+Math.round(driftMs)+' ms). Export stopped; try a shorter video or native export.');
  return {driftMs,maxDriftMs:this.maxDriftMs};
 }
 complete({now,mediaTime}){
  if(this.samples<2)throw Error('Not enough frames to verify export timing.');
  if(this.maxDriftMs>this.thresholdMs)
   throw Error('Recorded timing exceeded lip-sync tolerance.');
  const elapsed=(now-this.originNow)/1000,mediaElapsed=mediaTime-this.originMedia;
  if(abs(elapsed-mediaElapsed)*1000>this.thresholdMs)
   throw Error('Export end timing differs from video playback.');
  return {maxDriftMs:this.maxDriftMs,samples:this.samples};
 }
}
function ascii(bytes,at,n=4){
 if(at<0||at+n>bytes.length)return '';
 let str='';for(let j=0;j<n;j++)str+=String.fromCharCode(bytes[at+j]);
 return str;
}
export function inspectMp4Handlers(bytes){
 const tracks={audio:false,video:false};
 for(let i=0;i<=bytes.length-16;i++){
  if(bytes[i]!==104||ascii(bytes,i,4)!=='hdlr')continue;
  const size=bytes[i-4]*16777216+bytes[i-3]*65536+bytes[i-2]*256+bytes[i-1];
  if(i<4||size<24||size>10000000)continue;
  const type=ascii(bytes,i+12,4);
  if(type==='soun')tracks.audio=true;
  if(type==='vide')tracks.video=true;
 }
 return tracks;
}
// WebM EBML TrackEntry (0xAE) contains a TrackType element (0x83) whose
// one-byte value is 1 for video or 2 for audio. Examine only declared entries.
function vintSize(bytes,at){
 if(at>=bytes.length)return null;
 const first=bytes[at];if(!first)return null;
 let mask=128,len=1;
 while(len<=8&&!(first&mask)){mask>>=1;len++}
 if(len>8||at+len>bytes.length)return null;
 let value=first&(mask-1);
 for(let j=1;j<len;j++)value=value*256+bytes[at+j];
 return {value,length:len};
}
export function inspectWebmTracks(bytes){
 const tracks={audio:false,video:false};
 for(let i=0;i<bytes.length-5;i++){
  if(bytes[i]!==0xae)continue;
  const size=vintSize(bytes,i+1);
  if(!size||size.value<4||size.value>65536)continue;
  const start=i+1+size.length,end=start+size.value;
  if(end>bytes.length)continue;
  let cursor=start;
  while(cursor<end){
   const id=bytes[cursor]; // TrackType is a single-byte EBML ID.
   if(id===0x83){
    const field=vintSize(bytes,cursor+1);
    if(field?.value===1&&cursor+1+field.length+1<=end){
     const type=bytes[cursor+1+field.length];
     if(type===1)tracks.video=true;
     if(type===2)tracks.audio=true;
    }
   }
   // Skip known single-byte subelements; otherwise scan inside TrackEntry.
   cursor++;
  }
  if(tracks.audio&&tracks.video)break;
 }
 return tracks;
}
export async function inspectRecordedTracks(blob,mime){
 if(!(blob instanceof Blob)||blob.size<2048)throw Error('Export video is empty.');
 const windowSize=4*1024*1024;
 const head=new Uint8Array(await blob.slice(0,Math.min(blob.size,windowSize)).arrayBuffer());
 const tail=blob.size>windowSize?new Uint8Array(await blob.slice(blob.size-windowSize).arrayBuffer()):null;
 const isMp4=mime.includes('mp4');
 const inspect=isMp4?inspectMp4Handlers:inspectWebmTracks;
 const a=inspect(head),b=tail?inspect(tail):{audio:false,video:false};
 const tracks={audio:a.audio||b.audio,video:a.video||b.video};
 if(!tracks.video||!tracks.audio)
  throw Error('Encoded file did not confirm both audio and video tracks. Export withheld to prevent a silent or invalid video.');
 return tracks;
}
export async function probeRecordedDuration(blob,expectedDuration,timeoutMs=10000){
 if(typeof document==='undefined')throw Error('Browser media probe unavailable.');
 const el=document.createElement('video');
 el.preload='metadata';el.playsInline=true;el.muted=true;
 const url=URL.createObjectURL(blob);
 try{
  const duration=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(Error('Could not inspect the finished video.'))},timeoutMs);
   const cleanup=()=>{clearTimeout(timer);el.onloadedmetadata=null;el.onerror=null};
   el.onloadedmetadata=()=>{const value=el.duration;cleanup();resolve(value)};
   el.onerror=()=>{cleanup();reject(Error('The recorded file could not be decoded.'))};
   el.src=url;el.load();
  });
  if(!Number.isFinite(duration)||duration<=0)
   throw Error('The browser did not produce a measurable export duration.');
  const tolerance=Math.max(SYNC_MAX_DURATION_ERROR_MS/1000,expectedDuration*.01);
  const error=abs(duration-expectedDuration);
  if(error>tolerance)
   throw Error('Audio/video container duration differs from your edit by '+Math.round(error*1000)+' ms. Export withheld.');
  return {duration,durationErrorMs:error*1000};
 }finally{el.removeAttribute('src');el.load();URL.revokeObjectURL(url)}
}
