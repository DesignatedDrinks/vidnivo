import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable,Writable} from 'node:stream';
import {writeBoundedMedia} from '../src/mediaStream.mjs';
function sink(){
 const chunks=[];
 return {chunks,stream:new Writable({write(chunk,enc,done){chunks.push(chunk);done();}})};
}
test('streamed video bytes are transferred exactly, without JSON buffering',async()=>{
 const target=sink();
 const n=await writeBoundedMedia(Readable.from([Buffer.from('12'),Buffer.from('345')]),
  target.stream,5,20);
 assert.equal(n,5);
 assert.equal(Buffer.concat(target.chunks).toString(),'12345');
});
test('oversized, absent and dishonest content lengths fail closed',async()=>{
 await assert.rejects(
  writeBoundedMedia(Readable.from([Buffer.alloc(11)]),sink().stream,11,10),
  {status:413});
 await assert.rejects(
  writeBoundedMedia(Readable.from([Buffer.alloc(7)]),sink().stream,5,10),
  {status:413});
 await assert.rejects(
  writeBoundedMedia(Readable.from([Buffer.alloc(3)]),sink().stream,5,10),
  {status:400});
});
