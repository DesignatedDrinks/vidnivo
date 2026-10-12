import test from 'node:test';
import assert from 'node:assert/strict';
import {addAsset, createProject, rippleSpeedClip, clipDurationMs} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
const asset=id=>({id,kind:'video',uri:`file:///tmp/${id}.mp4`,filename:id,durationMs:5000,width:1920,height:1080});
test('changing first clip speed shifts later clips and stays exportable',()=>{
 let p=addAsset(addAsset(createProject(),asset('first')),asset('second'));
 const first=p.clips[0].id;
 p=rippleSpeedClip(p,first,2);
 assert.equal(p.clips[1].startMs,2500);
 assert.equal(clipDurationMs(p.clips[0]),2500);
 assert.equal(createExportPlan(p).durationMs,7500);
 p=rippleSpeedClip(p,first,.5);
 assert.equal(p.clips[1].startMs,10000);
 assert.equal(createExportPlan(p).durationMs,15000);
});
test('missing clip returns unchanged',()=>{
 const p=createProject();
 assert.equal(rippleSpeedClip(p,'not-found',2),p);
});
