import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPlayableExport,expectedExport} from '../src/export/qualityGate.ts';
const expectation={durationMs:12000,width:720,height:1280,clipCount:3,expectImportedAudio:true};
const valid={durationMs:11967,width:720,height:1280,videoTracks:1,audioTracks:1,bytes:5000000};
test('actual encoded video metadata passes when all tracks and dimensions are correct',()=>{
 assert.doesNotThrow(()=>assertPlayableExport(valid,expectation));
});
test('rejects empty video, missing video streams and incomplete metadata',()=>{
 for(const data of [{...valid,bytes:0},{...valid,videoTracks:0},
  {...valid,durationMs:0},{...valid,width:0},{...valid,bytes:NaN},
  {...valid,audioTracks:-1},null,{}]){
  assert.throws(()=>assertPlayableExport(data,expectation));
 }
});
test('rejects incorrect aspect ratio, duration and missing imported voiceover',()=>{
 assert.throws(()=>assertPlayableExport({...valid,width:1280,height:720},expectation),/dimensions/);
 assert.throws(()=>assertPlayableExport({...valid,durationMs:15700},expectation),/duration/);
 assert.throws(()=>assertPlayableExport({...valid,audioTracks:0},expectation),/audio/);
 assert.doesNotThrow(()=>assertPlayableExport({...valid,audioTracks:0},
  {...expectation,expectImportedAudio:false}));
});
test('quality verification tolerates normal frame rounding but never seconds of drift',()=>{
 const expected={...expectation,clipCount:4,expectImportedAudio:false};
 assert.doesNotThrow(()=>assertPlayableExport({...valid,durationMs:12100},expected));
 assert.throws(()=>assertPlayableExport({...valid,durationMs:14200},expected));
});
test('the export plan requires an audio track for audible added voiceovers',()=>{
 const c={durationMs:12000,width:720,height:1280,clips:[
  {track:'video',muted:true,volume:1,startMs:0},
  {track:'audio',muted:false,volume:1,startMs:3000}
 ]};
 assert.equal(expectedExport(c).expectImportedAudio,true);
 assert.equal(expectedExport({...c,clips:[c.clips[0],{...c.clips[1],muted:true}]}).expectImportedAudio,false);
 assert.equal(expectedExport({...c,clips:[c.clips[0],{...c.clips[1],startMs:18000}]}).expectImportedAudio,false);
});
