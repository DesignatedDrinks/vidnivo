import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCaptionsFromScript} from '../src/domain/captionGenerator.ts';
import {parseCaptions,serializeSrt} from '../src/domain/captions.ts';
test('script captions cover exact range and preserve words and punctuation',()=>{
 const script='Making content is difficult. But showing up matters every single day. Keep going!';
 const result=generateCaptionsFromScript(script,1200,18000,5);
 assert.equal(result[0].startMs,1200);
 assert.equal(result.at(-1).endMs,18000);
 assert.equal(result.map(c=>c.text).join(' '),script);
 assert.ok(result.length>=3);
 assert.ok(result.every(c=>c.endMs-c.startMs>=250));
 assert.deepEqual(parseCaptions(serializeSrt(result)),result);
});
test('script generator is honest about invalid timing and empty scripts',()=>{
 for(const text of ['', ' ', '\n'])assert.throws(()=>generateCaptionsFromScript(text,0,3000),/script/);
 assert.throws(()=>generateCaptionsFromScript('one two three four five six',0,300),/too short/);
 assert.throws(()=>generateCaptionsFromScript('hello',0,0),/range/);
 assert.throws(()=>generateCaptionsFromScript('hello',0,500,0),/1–10/);
});
test('long scripts split into short segments without overlaps',()=>{
 const source=Array.from({length:150},(_,i)=>'word'+i).join(' ');
 const c=generateCaptionsFromScript(source,0,60000,4);
 assert.equal(c.length,38);
 assert.equal(c.at(-1).endMs,60000);
 assert.ok(c.every((item,i)=>i===0||item.startMs===c[i-1].endMs));
});
