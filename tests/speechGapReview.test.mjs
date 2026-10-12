import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,validateProject} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
import {proposeSpeechGaps,estimateApprovedSavings,applyReviewedSpeechGaps} from '../src/domain/speechGapReview.ts';
const video=(id,durationMs=10000)=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id+'.mp4',durationMs,width:1080,height:1920});
const speech=[
 {startMs:1100,endMs:1550,text:'first'},
 {startMs:5000,endMs:5480,text:'second'},
 {startMs:7900,endMs:8440,text:'third'}
];
test('protect opening, closing and natural breathing space while proposing internal gaps',()=>{
 let p=addAsset(createProject(),video('one'));
 const clip=p.clips[0],cuts=proposeSpeechGaps(clip,speech);
 assert.equal(cuts.length,2);
 assert.ok(cuts[0].fromMs>1550);
 assert.ok(cuts[1].toMs<7900);
 assert.ok(cuts.every(c=>c.savesMs>=450));
 assert.equal(estimateApprovedSavings(cuts,new Set()),0);
 assert.equal(applyReviewedSpeechGaps(p,clip.id,cuts,new Set()),p);
});
test('manual approval moves downstream visuals and does not delete reactions by default',()=>{
 let p=addAsset(addAsset(createProject(),video('first')),video('second'));
 const clip=p.clips[0], cuts=proposeSpeechGaps(clip,speech);
 const selected=new Set([cuts[0].id]);
 const saving=estimateApprovedSavings(cuts,selected);
 p=applyReviewedSpeechGaps(p,clip.id,cuts,selected);
 assert.equal(p.clips.length,3);
 assert.equal(p.clips[0].inMs,0);
 assert.equal(p.clips[1].outMs,10000);
 assert.ok(Math.abs(p.clips[2].startMs-(10000-saving))<=1);
 assert.equal(createExportPlan(p).durationMs,20000-saving);
 validateProject(p);
});
test('overlapping word timestamps never produce cuts inside recognized speech',()=>{
 const p=addAsset(createProject(),video('first'));
 const words=[
  {startMs:1000,endMs:5000,text:'long phrase'},
  {startMs:2000,endMs:2600,text:'overlap'},
  {startMs:4600,endMs:5400,text:'continuation'},
  {startMs:7000,endMs:7500,text:'next'}
 ];
 const candidates=proposeSpeechGaps(p.clips[0],words);
 assert.equal(candidates.length,1);
 assert.ok(candidates[0].fromMs>=5400);
});
test('never call no-speech-detected an empty sound track',()=>{
 let p=addAsset(createProject(),video('first'));
 assert.deepEqual(proposeSpeechGaps(p.clips[0],[]),[]);
 assert.deepEqual(proposeSpeechGaps(p.clips[0],[speech[0]]),[]);
});
test('reject unapproved and stale plans; preserve media and captions',()=>{
 let p=addAsset(createProject(),video('first'));
 const cuts=proposeSpeechGaps(p.clips[0],speech);
 assert.throws(()=>applyReviewedSpeechGaps(p,p.clips[0].id,cuts,new Set(['unknown'])),/invalid/);
 const changed={...p,clips:[{...p.clips[0],inMs:4500}]};
 assert.throws(()=>applyReviewedSpeechGaps(changed,p.clips[0].id,cuts,new Set([cuts[0].id])),/stale|short/);
 const withCaptions=addText(p,'Important reaction',1300);
 assert.throws(()=>applyReviewedSpeechGaps(withCaptions,p.clips[0].id,cuts,new Set([cuts[0].id])),/before adding/);
});
