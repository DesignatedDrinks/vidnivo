import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync('index.html','utf8');
const deployed=readFileSync('docs/index.html','utf8');
const core=readFileSync('vidnivo-export-sync.js','utf8');
const deployedCore=readFileSync('docs/vidnivo-export-sync.js','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const sync=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));

function clip(start,end,sourceId='source',speed=1){
 return {id:'clip-'+start,sourceId,start,end,speed};
}
function parse(code){
 const p=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr||p.stdout);
}
test('web editor deployment includes the real lip-sync guard in both Pages variants',()=>{
 assert.equal(html,deployed);
 assert.equal(core,deployedCore);
 assert.match(script,/import \{planContinuousExport,PlaybackSyncGuard,inspectRecordedTracks,probeRecordedDuration\}/);
 assert.match(html,/id="syncStatus"/);
 parse(script);parse(core);
});
test('continuous timeline with repeated split segments collapses to uninterrupted A/V',()=>{
 const plan=sync.planContinuousExport([clip(1,2),clip(2,3.5),clip(3.5,6)]);
 assert.equal(plan.ok,true);assert.equal(plan.start,1);assert.equal(plan.end,6);
 assert.equal(plan.duration,5);assert.equal(plan.clip.speed,1);
});
test('timeline rejects gaps, reordered clips, mixed sources and speed changes',()=>{
 for(const clips of [
  [clip(0,1),clip(1.1,3)],
  [clip(0,2),clip(1,3)],
  [clip(0,1),clip(1,2,'different')],
  [clip(0,3,'source',.75)],
  [clip(0,3,'source',1.5)],
  [clip(2,1)],
  [],[clip(0,601)]
 ]){
  assert.equal(sync.planContinuousExport(clips).ok,false,JSON.stringify(clips));
 }
});
test('playback sync guard tracks actual media clock against recorder wall-clock',()=>{
 const g=new sync.PlaybackSyncGuard({start:10,expectedDuration:2});
 for(let i=0;i<12;i++)g.sample({now:i*100,mediaTime:10+i*.1});
 const end=g.complete({now:1100,mediaTime:11.1});
 assert.equal(end.samples,12);
 assert.ok(end.maxDriftMs<1);
});
test('rejects growing audio/video drift and paused or discontinuous playback',()=>{
 const drift=new sync.PlaybackSyncGuard({start:0,expectedDuration:4});
 drift.sample({now:0,mediaTime:0});
 assert.throws(()=>drift.sample({now:500,mediaTime:.18}),/Lip-sync drift detected/);
 const paused=new sync.PlaybackSyncGuard({start:0,expectedDuration:4});
 assert.throws(()=>paused.sample({now:0,mediaTime:0,paused:true}),/stopped/);
 const seek=new sync.PlaybackSyncGuard({start:3,expectedDuration:4});
 seek.sample({now:0,mediaTime:3.5});
 assert.throws(()=>seek.sample({now:100,mediaTime:3.35}),/backwards/);
 const stall=new sync.PlaybackSyncGuard({start:0,expectedDuration:5});
 stall.sample({now:0,mediaTime:0});
 assert.throws(()=>stall.sample({now:1800,mediaTime:1.8}),/stalled/);
});
test('MP4 inspection confirms real video and audio handler atoms',()=>{
 function box(type){
  const b=Buffer.alloc(28);b.writeUInt32BE(28,0);b.write('hdlr',4);b.write(type,16);return b;
 }
 const tracks=sync.inspectMp4Handlers(Buffer.concat([box('vide'),box('soun')]));
 assert.deepEqual(tracks,{audio:true,video:true});
 assert.deepEqual(sync.inspectMp4Handlers(box('vide')),{audio:false,video:true});
});
test('WebM inspection requires both declared video/audio track types',()=>{
 const video=Buffer.from([0xae,0x84,0x83,0x81,0x01,0x00]);
 const audio=Buffer.from([0xae,0x84,0x83,0x81,0x02,0x00]);
 assert.deepEqual(sync.inspectWebmTracks(Buffer.concat([video,audio])),{audio:true,video:true});
 assert.deepEqual(sync.inspectWebmTracks(video),{audio:false,video:true});
});
test('missing audio in exported file fails rather than reporting successful sync',async()=>{
 const b=Buffer.alloc(4100);
 b.writeUInt32BE(28,0);b.write('hdlr',4);b.write('vide',16);
 await assert.rejects(sync.inspectRecordedTracks(new Blob([b]),'video/mp4'),/audio and video tracks/);
});
test('browser export never records before play and never guesses video time',()=>{
 const from=script.indexOf('async function startExport(){'),to=script.indexOf('function setTab(',from);
 const method=script.slice(from,to);
 assert.ok(from>0&&to>from);
 assert.ok(method.indexOf('await play();')<method.indexOf('recorder.start(100);'));
 assert.match(method,/guard\.sample\(\{now,mediaTime:video\.currentTime/);
 assert.match(method,/await inspectRecordedTracks\(blob,mime\)/);
 assert.match(method,/await probeRecordedDuration\(blob,plan\.duration\)/);
 assert.match(method,/frameRequest=video\.requestVideoFrameCallback/);
 assert.match(method,/stream\.getVideoTracks\(\)\.length!==1\|\|stream\.getAudioTracks\(\)\.length!==1/);
 assert.match(script,/else if\(!video\.paused&&!state\.exporting\)/);
 assert.match(method,/state\.clips=\[plan\.clip\]/);
 assert.match(method,/state\.clips=savedClips/);
});
