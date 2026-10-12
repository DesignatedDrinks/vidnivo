import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset, validateProject } from '../src/domain/timeline.ts';
import { createExportPlan } from '../src/export/plan.ts';
const v={id:'video',kind:'video',uri:'file:///video.mp4',filename:'video.mp4',durationMs:20000,width:1080,height:1920};
const a={id:'voice',kind:'audio',uri:'file:///voiceover.m4a',filename:'voiceover.m4a',durationMs:3500,width:0,height:0};
test('recorded voiceover can be placed at playhead without moving original video',()=>{
 let p=addAsset(createProject(),v);
 p=addAsset(p,a,'audio',5400);
 validateProject(p);
 assert.equal(p.clips[0].startMs,0);
 assert.equal(p.clips[1].startMs,5400);
 assert.equal(p.clips[1].track,'audio');
 const plan=createExportPlan(p);
 assert.equal(plan.clips.find(c=>c.track==='audio')?.startMs,5400);
 assert.equal(plan.durationMs,20000);
});
test('repeated voiceovers permit overlapping audio without changing video duration',()=>{
 let p=addAsset(createProject(),v);
 p=addAsset(p,a,'audio',500);
 p=addAsset(p,{...a,id:'voice2'},'audio',1000);
 assert.equal(p.clips.filter(c=>c.track==='audio').length,2);
 assert.equal(p.clips[0].startMs,0);
 assert.equal(createExportPlan(p).durationMs,20000);
});
