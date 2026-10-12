import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset } from '../src/domain/timeline.ts';
import {decodeProjects,encodeProjects} from '../src/data/storageCodec.ts';
test('valid library metadata round-trips without dropping projects',()=>{
 let p=addAsset(createProject('Recovered'),{id:'video',kind:'video',uri:'file:///tmp/video.mp4',filename:'video.mp4',durationMs:3000,width:1080,height:1920});
 const restored=decodeProjects(encodeProjects([p]));
 assert.deepEqual(restored,[p]);
 assert.deepEqual(decodeProjects('[]'),[]);
});
test('invalid, corrupt or incomplete libraries are rejected for recovery',()=>{
 for(const content of ['{not-json','{}','[null]','[{}]','[1]','[{"id":"x"}]'])
  assert.throws(()=>decodeProjects(content),Error);
 assert.throws(()=>decodeProjects('a'.repeat(25*1024*1024+1)),/size/);
});
test('project metadata cannot be persisted with invalid timelines',()=>{
 const p=createProject();
 p.clips.push({id:'bad',assetId:'missing',track:'video',startMs:0,inMs:0,outMs:1000,speed:1,volume:1,muted:false});
 assert.throws(()=>encodeProjects([p]),/Invalid clip timeline/);
});
