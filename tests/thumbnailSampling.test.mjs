import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleThumbnailTimesMs} from '../src/domain/thumbnailSampling.ts';
test('filmstrip frames sample different moments of source video',()=>{
 const f=sampleThumbnailTimesMs(2000,8000,6);
 assert.equal(f.length,6);
 assert.equal(new Set(f).size,6);
 assert.ok(f.every(t=>t>2000&&t<8000));
 assert.ok(f.every((t,i)=>i===0||t>f[i-1]));
});
test('short clips and excessive count are handled safely',()=>{
 assert.equal(sampleThumbnailTimesMs(0,250,100).length,10);
 assert.equal(sampleThumbnailTimesMs(-1,-2,0).length,1);
 assert.ok(sampleThumbnailTimesMs(2500,2500,1)[0]>2500);
});
