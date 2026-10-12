import test from 'node:test';
import assert from 'node:assert/strict';
import {addAsset, createProject, rippleTrimClip, rippleDeleteClip, durationMs, validateProject, clipDurationMs} from '../src/domain/timeline.ts';
import { createExportPlan } from '../src/export/plan.ts';
const clipAsset=id=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id+'.mp4',durationMs:6000,width:1080,height:1920});
function twoVideos(){let p=createProject();p=addAsset(p,clipAsset('one'));return addAsset(p,clipAsset('two'));}
test('ripple left trim preserves seamless primary video track',()=>{
  let p=twoVideos(), first=p.clips[0].id;
  p=rippleTrimClip(p,first,'left',1000);
  assert.equal(p.clips[0].startMs,0);
  assert.equal(p.clips[0].inMs,1000);
  assert.equal(p.clips[1].startMs,5000);
  assert.equal(durationMs(p),11000);
  validateProject(p);assert.equal(createExportPlan(p).durationMs,11000);
});
test('ripple right trim shifts subsequent clips left',()=>{
  let p=twoVideos();
  p=rippleTrimClip(p,p.clips[0].id,'right',-2000);
  assert.equal(clipDurationMs(p.clips[0]),4000);
  assert.equal(p.clips[1].startMs,4000);
  assert.equal(durationMs(p),10000);
});
test('ripple removal closes the deleted clip gap',()=>{
  let p=twoVideos();
  p=rippleDeleteClip(p,p.clips[0].id);
  assert.equal(p.clips.length,1);
  assert.equal(p.clips[0].startMs,0);
  assert.equal(createExportPlan(p).durationMs,6000);
});
test('ripple delete of audio does not move video timeline',()=>{
 let p=twoVideos();
 const videoPositions=p.clips.map(c=>c.startMs);
 p=addAsset(p,{id:'track',kind:'audio',filename:'track.mp3',uri:'file:///tmp/track.mp3',durationMs:12000,width:0,height:0});
 p=rippleDeleteClip(p,p.clips[2].id);
 assert.deepEqual(p.clips.map(c=>c.startMs),videoPositions);
});
