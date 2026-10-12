import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,duplicateClip,clipDurationMs,validateProject} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
const video=id=>({id,kind:'video',filename:id+'.mp4',uri:'file:///test/'+id+'.mp4',durationMs:3000,width:1080,height:1920});
test('video duplication inserts adjacent copy and shifts later video and text',()=>{
 let p=addAsset(addAsset(createProject(),video('a')),video('b'));
 p=addText(p,'Ending',3100,1000);
 const id=p.clips[0].id;
 const previousAssetIds=p.assets.length;
 p=duplicateClip(p,id);
 assert.equal(p.clips.length,3);
 assert.equal(p.assets.length,previousAssetIds);
 assert.equal(p.clips[1].startMs,6000);
 const copy=p.clips.find(c=>c.id!==id && c.assetId===p.clips[0].assetId);
 assert.ok(copy);assert.equal(copy.startMs,3000);
 assert.equal(p.texts[0].startMs,6100);
 assert.equal(createExportPlan(p).durationMs,9000);
 validateProject(p);
});
test('duplicating audio makes overlapping independent audio clip',()=>{
 let p=addAsset(createProject(),video('a'));
 p=addAsset(p,{id:'sound',kind:'audio',filename:'sound.mp3',uri:'file:///sound.mp3',durationMs:1000,width:0,height:0},'audio',500);
 const id=p.clips[1].id;
 p=duplicateClip(p,id);
 assert.equal(p.clips[0].startMs,0);
 assert.equal(p.clips[2].startMs,1500);
 assert.equal(clipDurationMs(p.clips[2]),1000);
});
