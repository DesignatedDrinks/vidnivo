import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,validateProject,editClip,moveClip,splitClip,trimClip} from '../src/domain/timeline.ts';
import {encodeProjects,decodeProjects} from '../src/data/storageCodec.ts';
const video={id:'v',kind:'video',uri:'file:///tmp/v.mp4',filename:'video.mp4',durationMs:10000,width:1080,height:1920};
test('tampered time, nonfinite media and duplicate IDs are rejected before saving',()=>{
 const p=addAsset(createProject(),video),clip=p.clips[0];
 for(const value of [NaN,Infinity,-1]){
  assert.throws(()=>validateProject({...p,clips:[{...clip,startMs:value}]}),/Invalid clip/);
 }
 assert.throws(()=>validateProject({...p,clips:[{...clip,outMs:12000}]}),/Invalid clip/);
 assert.throws(()=>validateProject({...p,clips:[clip,{...clip}]}),/Duplicate clips/);
 assert.throws(()=>validateProject({...p,assets:[{...video,durationMs:NaN}]}),/Invalid media/);
 assert.throws(()=>validateProject({...p,clips:[{...clip,speed:NaN}]}),/Invalid clip/);
 assert.throws(()=>validateProject({...p,clips:[{...clip,track:'audio'}]}),/Invalid clip/);
});
test('invalid editor gestures cannot poison future draft backups',()=>{
 let p=addAsset(createProject(),video);
 const id=p.clips[0].id;
 assert.throws(()=>splitClip(p,id,NaN),/Invalid split/);
 assert.throws(()=>trimClip(p,id,'left',Infinity),/Invalid trim/);
 assert.throws(()=>moveClip(p,id,NaN),/Invalid clip movement/);
 assert.throws(()=>editClip(p,id,{speed:NaN}),/Invalid clip speed/);
 assert.throws(()=>editClip(p,id,{volume:Infinity}),/Invalid clip volume/);
 assert.throws(()=>addText(p,'Hello',NaN),/Invalid text timing/);
 assert.deepEqual(decodeProjects(encodeProjects([p])),[p]);
});
test('damaged caption layer cannot be persisted',()=>{
 let p=addText(addAsset(createProject(),video),'hello',0);
 assert.throws(()=>encodeProjects([{...p,texts:[{...p.texts[0],endMs:NaN}]}]),/Invalid text/);
 assert.throws(()=>encodeProjects([{...p,texts:[{...p.texts[0],color:'not-hex'}]}]),/Invalid text/);
});
