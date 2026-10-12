import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync('index.html','utf8');
const mirror=readFileSync('docs/index.html','utf8');
const module=readFileSync('rollblink-autopilot.js','utf8');
const deploy=readFileSync('docs/rollblink-autopilot.js','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const functions=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const parse=code=>{
 const r=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
};
test('the public site and repo root both ship the complete creator workflow',()=>{
 assert.equal(html,mirror);
 assert.equal(module,deploy);
 parse(script);parse(module);
 for(const id of ['creatorStyle','creatorRun','creatorSave','creatorProgress','creatorStatus',
  'creatorCaptions','creatorTighten','creatorVoice','creatorHookPanel','creatorHookChoices','creatorHookRemove']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const match of script.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(ids.includes(match[1]),'Missing UI control '+match[1]);
});
test('each one-tap style produces a real consistent video and subtitle treatment',()=>{
 for(const key of ['talking','product','story']){
  const style=functions.getStyle(key);
  assert.equal(style.ratio,'9:16');
  assert.ok(style.size>=.55&&style.size<=2.4);
  assert.ok(style.y>=.15&&style.y<=.85);
  assert.ok(style.look!=='');
  assert.equal(style.voice,true);
 }
 assert.throws(()=>functions.getStyle('custom'),/No saved My Style/);
});
test('brand style is saved locally and restored; invalid storage fails harmlessly',()=>{
 const mem=new Map(),store={
  setItem:(key,val)=>mem.set(key,val),
  getItem:key=>mem.get(key)??null
 };
 const first=functions.saveStyle(store,{...functions.getStyle('story'),x:.78,y:.79,size:1.9});
 const restored=functions.loadStyle(store);
 assert.deepEqual(restored,first);
 assert.equal(restored.x,.78);
 store.setItem(functions.STYLE_KEY,'{broken-json');
 assert.equal(functions.loadStyle(store),null);
});
test('auto captions honor creator placement while custom hand-set captions stay untouched',()=>{
 const style=functions.getStyle('product');
 const personal={id:'manual',origin:'manual',text:'hand set',x:.12,y:.46,fontScale:2.1};
 const automatic={id:'a',origin:'auto',text:'a spoken thought',position:'bottom'};
 const result=functions.styleCaptions([automatic,personal],style);
 assert.equal(result[1],personal);
 assert.equal(result[0].fontScale,style.size);
 assert.equal(result[0].y,style.y);
 assert.equal(result[0].position,'custom');
});
test('speech-aware trimming only removes valid head and tail silence, never interior cuts',()=>{
 const p=functions.planSpeechEdgeTrim({duration:30,firstSpeech:1.4,lastSpeech:27.9});
 assert.equal(p.valid,true);
 assert.equal(p.front,1.15);
 assert.ok(p.back>1.8&&p.back<2.0);
 assert.ok(p.newDuration>26);
 assert.deepEqual(functions.planSpeechEdgeTrim({duration:30,firstSpeech:0,lastSpeech:30}).front,0);
 const faulty=functions.planSpeechEdgeTrim({duration:30,firstSpeech:20,lastSpeech:10});
 assert.equal(faulty.valid,false);
 const shifted=functions.shiftTimedCaptions([
  {text:'hello',start:1.4,end:3},{text:'final',start:27,end:27.8}],p.front,p.newDuration);
 assert.equal(shifted[0].start,.25);
 assert.ok(shifted.every(c=>c.end>c.start));
});
test('opening-hook choices only quote words from the actual transcript',()=>{
 const input=[
  {origin:'auto',text:'Hi and welcome',start:0,end:2},
  {origin:'auto',text:'The biggest mistake I made',start:3,end:5},
  {origin:'auto',text:'But this is what changed everything',start:7,end:9},
  {origin:'auto',text:'Would you do the same thing?',start:10,end:11},
  {origin:'manual',text:'Guaranteed to earn millions',start:0,end:3}
 ];
 const choices=functions.suggestOpeningHooks(input);
 assert.ok(choices.length>=2);
 assert.ok(choices.length<=3);
 assert.ok(choices.every(h=>input.some(c=>c.origin==='auto'&&c.text.replace(/[.!?]+$/,'').trim()===h.text)));
 assert.ok(!choices.some(c=>/Guaranteed/.test(c.text)));
});
test('one-click engine calls local captions, runs safe trims and real audio compression',()=>{
 assert.match(script,/async function runCreatorAutopilot/);
 assert.match(script,/await runAutoCaptions\(\{style,tighten:\$\('creatorTighten'\)\.checked\}\)/);
 assert.match(script,/planSpeechEdgeTrim\(\{duration:total\(\),firstSpeech,lastSpeech\}\)/);
 assert.match(script,/timeline\.start\+=plan\.front\*timeline\.speed/);
 assert.match(script,/timeline\.end-=plan\.back\*timeline\.speed/);
 assert.match(script,/context\.createDynamicsCompressor\(\)/);
 assert.match(script,/master\.connect\(destination\)/);
 assert.match(script,/source\.connect\(compressor\)/);
 assert.match(script,/await setFaceRetouch\(style\.retouch\)/);
 assert.match(script,/saveStyle\(window\.localStorage,style\)/);
 assert.match(script,/state\.clips=\[plan\.clip\]/); // old audio-safe export preserved
 assert.doesNotMatch(module,/fetch\(|apiKey|Authorization:/);
});
