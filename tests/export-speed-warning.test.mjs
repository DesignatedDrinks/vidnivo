import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,editClip} from '../src/domain/timeline.ts';
import {exportPreflight} from '../src/export/preflight.ts';
const video={id:'video',kind:'video',uri:'file:///tmp/video.mp4',filename:'video.mp4',durationMs:8000,width:1080,height:1920};
const audio={id:'voice',kind:'audio',uri:'file:///tmp/voice.m4a',filename:'voice.m4a',durationMs:6000,width:0,height:0};
test('preflight warns when audio preview cannot represent native render speed',()=>{
 let p=addAsset(createProject(),video);
 p=addAsset(p,audio,'audio',0);
 assert.equal(exportPreflight(p,'ios').warnings.length,0);
 p=editClip(p,p.clips[1].id,{speed:3});
 assert.ok(exportPreflight(p,'ios').warnings.some(x=>x.includes('2×')));
 p=editClip(p,p.clips[1].id,{muted:true});
 assert.equal(exportPreflight(p,'ios').warnings.length,0);
});
