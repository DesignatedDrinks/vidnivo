import test from 'node:test';
import assert from 'node:assert/strict';
import {pickedMediaDurationMs} from '../src/media/mediaDuration.ts';
test('18-second media import produces 18,000ms rather than 500ms',()=>{
  assert.equal(pickedMediaDurationMs('video',18),18000);
  assert.equal(pickedMediaDurationMs('video',0.5),500);
  assert.equal(pickedMediaDurationMs('video',63.245),63245);
});
test('photos default to five seconds',()=>{
 assert.equal(pickedMediaDurationMs('image'),5000);
});
test('missing, zero and invalid durations are rejected',()=>{
 for(const s of [undefined,null,0,-5,NaN,Infinity]) assert.throws(()=>pickedMediaDurationMs('video',s));
 assert.throws(()=>pickedMediaDurationMs('video',.01));
 assert.throws(()=>pickedMediaDurationMs('video',8000),/two hours/);
});
