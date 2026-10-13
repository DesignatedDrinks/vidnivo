import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=readFileSync('docs/index.html','utf8');
const mirror=readFileSync('index.html','utf8');
const shader=readFileSync('rollblink-filters.js','utf8');
const shaderMirror=readFileSync('docs/rollblink-filters.js','utf8');
const source=root.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
function checkModule(text){
 const r=spawnSync(process.execPath,['--check','--input-type=module'],{input:text,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
}
test('website actually serves the standalone editor from both Pages configurations',()=>{
 assert.match(mirror,/docs\/\?/,'Repository root must redirect to the Pages editor');
 assert.equal(shader,shaderMirror,'Root and /docs video shader must be identical');
 assert.match(root,/<canvas id="preview"/);
 assert.match(root,/<button id="autoCaptions"/);
 assert.match(root,/<button id="autoEnhance"/);
 assert.match(root,/<div id="lookPresets"/);
 assert.match(root,/<button id="downloadSrt"/);
});
test('browser scripts are valid ES modules',()=>{
 checkModule(source);checkModule(shader);
});
test('all referenced control IDs exist and are unique',()=>{
 const ids=[...root.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const match of source.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(ids.includes(match[1]),'Missing HTML control: '+match[1]);
 }
});
test('auto-caption engine uses local soundtrack and true timestamped speech model',()=>{
 assert.match(source,/decodeAudioData\(await audio\.arrayBuffer\(\)\)/);
 assert.match(source,/Xenova\/whisper-tiny\.en/);
 assert.match(source,/return_timestamps:'word'/);
 assert.match(source,/origin:'auto'/);
 assert.match(source,/state\.captions\.filter\(c=>c\.origin!=='auto'\)/);
 assert.match(source,/state\.captioning=true/);
 assert.doesNotMatch(source,/Bearer |OPENAI_API_KEY|api\.openai\.com/);
});
test('caption mapping rejects missing or invalid timestamps, preserves captions',()=>{
 const start=source.indexOf('function segmentsFromTranscript(result,maximum){');
 const stop=source.indexOf('async function getLocalSpeechModel(){',start);
 assert.ok(start>0&&stop>start);
 const closure=source.slice(start,stop);
 const apply=new Function('key','clamp',closure+';return segmentsFromTranscript')(
  ()=>Math.random().toString(36), (x,a,b)=>Math.max(a,Math.min(b,x))
 );
 const caps=apply({chunks:[{text:'A short example to add captions to a video now',
  timestamp:[1,4.6]}]},10);
 assert.ok(caps.length>=2);
 assert.equal(caps[0].origin,'auto');
 assert.ok(caps.every(c=>c.end>c.start&&c.start>=1&&c.end<=4.6));
 assert.throws(()=>apply({text:'no timings'},10),/timestamps/);
 assert.throws(()=>apply({chunks:[{timestamp:[NaN,3],text:'bad time'}]},10),/timestamped speech/);
});
test('Safari gets a real GPU or CPU colour rendering path with export parity',()=>{
 assert.match(source,/drawGradedVideo\(ctx,video/);
 assert.match(shader,/getContext\('webgl'/);
 assert.match(shader,/gl\.texImage2D/);
 assert.match(shader,/gl\.drawArrays/);
 assert.match(shader,/getImageData/);
 assert.doesNotMatch(source,/ctx\.filter=previewFilter\(\)/);
});


test('Whisper word timings create speech-aligned phrases rather than guessed sentence splits',()=>{
 const start=source.indexOf('function segmentsFromTranscript(result,maximum){');
 const stop=source.indexOf('async function getLocalSpeechModel(){',start);
 assert.ok(start>=0&&stop>start);
 const fn=new Function('key','clamp',source.slice(start,stop)+';return segmentsFromTranscript')(
  ()=>Math.random().toString(36), (x,a,b)=>Math.max(a,Math.min(b,x))
 );
 const output=fn({chunks:[
  {text:' I',timestamp:[.3,.51]},{text:' never',timestamp:[.51,.91]},
  {text:' expected',timestamp:[.91,1.33]},{text:' this.',timestamp:[1.33,1.75]},
  {text:' Here',timestamp:[2.3,2.55]},{text:' is',timestamp:[2.55,2.76]},
  {text:' why.',timestamp:[2.76,3.1]}
 ]},5);
 assert.equal(output.length,2);
 assert.deepEqual(output.map(c=>[c.start,c.end]),[[.3,1.75],[2.3,3.1]]);
 assert.equal(output[0].text,'I never expected this.');
 assert.equal(output[1].text,'Here is why.');
 assert.ok(output.every(c=>c.origin==='auto'));
});
test('soundtrack capture begins only after source playback starts',()=>{
 const start=source.indexOf('async function recordEditedAudio(){');
 const stop=source.indexOf('function resampleSpeech(buffer){',start);
 const method=source.slice(start,stop);
 assert.ok(start>0&&stop>start);
 assert.ok(method.indexOf('await play();')<method.indexOf('recorder.start(250);'));
});
