import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelsToTimeMs, timeMsToPixels } from '../src/domain/timelineCoordinates.ts';
test('time and pixel coordinates round-trip at zoom levels',()=>{
 for(const zoom of [.5,1,1.5,2,3]) {
  const pps=57*zoom;
  for(const ms of [0,500,3200,9600,17950]) {
   const x=timeMsToPixels(ms,pps,18000);
   assert.ok(Math.abs(pixelsToTimeMs(x,pps,18000)-ms)<.00001);
  }
 }
});
test('scrubbing clamps negative input, overscroll and bad values',()=>{
 assert.equal(pixelsToTimeMs(-100,57,10000),0);
 assert.equal(pixelsToTimeMs(9999,57,10000),10000);
 assert.equal(timeMsToPixels(-500,57,10000),0);
 assert.equal(timeMsToPixels(15000,57,10000),570);
 assert.equal(pixelsToTimeMs(NaN,57,10000),0);
 assert.throws(()=>pixelsToTimeMs(100,0,10000),/Invalid timeline scale/);
});
