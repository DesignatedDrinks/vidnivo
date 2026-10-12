import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset, splitClip, moveClip, addText, editClip } from '../src/domain/timeline.ts';
import { createExportPlan } from '../src/export/plan.ts';
const video=(id,durationMs=5000)=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id+'.mp4',durationMs,width:1920,height:1080});
test('plans consecutive video segments and timed caption',()=>{
 let p=addAsset(createProject('demo'),video('a'));
 p=splitClip(p,p.clips[0].id,2500);
 p=addText(p,'VISUAL CAPTION',0,6000);
 const plan=createExportPlan(p);
 assert.equal(plan.width,1080); assert.equal(plan.height,1920);
 assert.equal(plan.durationMs,5000); assert.equal(plan.clips.length,2);
 assert.equal(plan.texts[0].endMs,5000);
});
test('rejects gaps and overlaps before native render',()=>{
 let p=addAsset(createProject(),video('a'));
 p=addAsset(p,video('b'));
 const second=p.clips[1].id;
 assert.throws(()=>createExportPlan(moveClip(p,second,1000)),/Remove timeline gaps/);
 assert.throws(()=>createExportPlan(moveClip(p,second,-1000)),/Overlapping video/);
});
test('speed adjustment changes exported duration and clips',()=>{
 let p=addAsset(createProject(),video('a'));
 p=editClip(p,p.clips[0].id,{speed:2,volume:.4});
 const plan=createExportPlan(p,720);
 assert.equal(plan.durationMs,2500);assert.equal(plan.width,720);
 assert.equal(plan.height,1280);assert.equal(plan.clips[0].volume,.4);
});
test('supports a still-photo montage and rejects nonlocal media',()=>{
 const image={id:'pic',kind:'image',uri:'file:///tmp/pic.jpg',filename:'pic.jpg',durationMs:3000,width:1080,height:1920};
 const still=createExportPlan(addAsset(createProject(),image));
 assert.equal(still.durationMs,3000);
 assert.equal(still.clips[0].kind,'image');
 assert.equal(still.clips[0].outMs,3000);
 let mixed=addAsset(addAsset(createProject(),video('opening')),image);
 mixed=addAsset(mixed,video('outro'));
 const montage=createExportPlan(mixed);
 assert.deepEqual(montage.clips.map(c=>c.kind),['video','image','video']);
 assert.equal(montage.durationMs,13000);
 assert.equal(montage.clips[1].startMs,5000);
 assert.throws(()=>createExportPlan(addAsset(createProject(),{...video('a'),uri:'https://example.com/a.mp4'})),/local video or photo/);
});

test('photo trims and playback speed preserve still-frame duration',()=>{
 const image={id:'photo',kind:'image',uri:'file:///tmp/portrait.png',filename:'portrait.png',
  durationMs:5000,width:1440,height:1920};
 let p=addAsset(createProject(),image);
 p=editClip(p,p.clips[0].id,{speed:2});
 const result=createExportPlan(p,720);
 assert.equal(result.durationMs,2500);
 assert.equal(result.clips[0].kind,'image');
 assert.equal(result.clips[0].speed,2);
});
test('excessively long static image display is rejected before encoding',()=>{
 const still={id:'still',kind:'image',uri:'file:///tmp/still.jpg',filename:'still.jpg',
  durationMs:130000,width:1920,height:1080};
 assert.throws(()=>createExportPlan(addAsset(createProject(),still)),/two minutes/);
});
