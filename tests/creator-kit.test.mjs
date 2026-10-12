import test from 'node:test';
import assert from 'node:assert/strict';
import {FONT_CHOICES,fontById,draftSocialCopy,honestHook,applyDirection,inspectEdit,projectSnapshot,canRestoreSnapshot,hydrateSnapshot} from '../docs/rollblink-creator-kit.js';

const spoken=[
 {id:'a',text:'I spent three years building my business.',start:0,end:2,origin:'auto',position:'bottom'},
 {id:'b',text:'The mistake was trying to do everything myself.',start:2,end:4.5,origin:'auto',position:'bottom'}
];
test('fonts are unique and safe fallback exists',()=>{
 assert.equal(FONT_CHOICES.length,24);
 assert.equal(new Set(FONT_CHOICES.map(f=>f.id)).size,24);
 assert.equal(fontById('unknown').id,'inter');
});
test('copy is grounded in spoken captions and excludes title layers',()=>{
 const caps=[...spoken,{text:'MADE UP HEADLINE',start:0,end:2.5,origin:'title'}];
 for(const p of ['Instagram','TikTok','YouTube Shorts','LinkedIn']){
  const draft=draftSocialCopy(p,caps);
  assert.match(draft.copy,/building my business/i);
  assert.doesNotMatch(draft.copy,/MADE UP HEADLINE/);
  assert.ok(draft.title.length>0);
 }
 assert.ok(honestHook(spoken).length>0);
});
test('styles preserve caption timings',()=>{
 for(const direction of ['clean','punchy','editorial']){
  const result=applyDirection(spoken,direction);
  assert.deepEqual(result.map(x=>[x.start,x.end]),spoken.map(x=>[x.start,x.end]));
  assert.equal(result[0].fontId,result[1].fontId);
 }
});
test('preflight blocks invalid source and catches overlapping captions',()=>{
 const report=inspectEdit({sources:[],clips:[{sourceId:'missing',start:0,end:4,speed:1}],captions:spoken,duration:4.5});
 assert.equal(report.ok,false);
 assert.ok(report.problems.some(p=>p.code==='MISSING_SOURCE'));
 const overlap=inspectEdit({sources:[{id:'ok'}],clips:[{sourceId:'ok',start:0,end:5,speed:1}],
  captions:[spoken[0],{...spoken[1],start:1.7}],duration:5});
 assert.ok(overlap.problems.some(p=>p.code==='OVERLAP'));
});
test('recovery stores only metadata and validates original files',()=>{
 const sources=[{id:'source',name:'clip.mov',size:123456,duration:10,url:'blob:secret'}];
 const draft=projectSnapshot({sources,clips:[{sourceId:'source',start:0.5,end:9,speed:1}],
  captions:spoken,ratio:'9:16',look:'warm',voicePolish:true,captionFontId:'inter'});
 assert.equal(JSON.stringify(draft).includes('blob:secret'),false);
 assert.equal(canRestoreSnapshot(draft,sources),true);
 assert.equal(canRestoreSnapshot(draft,[{...sources,size:123457}]),false);
 let n=0;const result=hydrateSnapshot(draft,sources,()=>String(++n));
 assert.equal(result.clips.length,1);
 assert.equal(result.captions.length,2);
 assert.equal(result.clips[0].sourceId,'source');
});
