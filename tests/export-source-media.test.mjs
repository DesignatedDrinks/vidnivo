import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset} from '../src/domain/timeline.ts';
import {assertAvailableSourceMedia} from '../src/export/sourceMedia.ts';
const media=id=>({id,kind:'video',uri:'file:///local/'+id+'.mp4',filename:id+'.mp4',durationMs:3000,width:1080,height:1920});
test('missing source files surface a helpful cloud portability error before export',()=>{
 const p=addAsset(createProject(),media('interview'));
 assert.throws(()=>assertAvailableSourceMedia(p,()=>false),e=>
  e.message.includes('interview.mp4')&&e.message.includes('Google Sheets'));
});
test('split/reused clip references are checked only once',()=>{
 let p=addAsset(createProject(),media('reused'));
 p={...p,clips:[p.clips[0],{...p.clips[0],id:'duplicate',startMs:3000}]};
 let hits=0;
 assert.doesNotThrow(()=>assertAvailableSourceMedia(p,()=>{hits++;return true;}));
 assert.equal(hits,1);
});
test('empty project need not query a nonexistent asset',()=>{
 assert.doesNotThrow(()=>assertAvailableSourceMedia(createProject(),()=>{throw Error('should not be called');}));
});
