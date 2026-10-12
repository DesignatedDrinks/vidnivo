import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,validateProject} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
import {planSilenceRemoval,applySilenceRemoval} from '../src/domain/silenceCuts.ts';
const video=id=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id,durationMs:10000,width:1080,height:1920});
test('speech pauses are cut and downstream clips ripple without gaps',()=>{
 let p=addAsset(addAsset(createProject(),video('one')),video('two'));
 const original=p.clips[0], words=[
 {startMs:1000,endMs:1600,text:'hello'}, {startMs:5000,endMs:5550,text:'again'}];
 const plan=planSilenceRemoval(original,words);
 assert.ok(plan && plan.savedMs>0);
 p=applySilenceRemoval(p,original.id,plan);
 assert.equal(p.clips.length,3);
 assert.ok(p.clips[1].startMs>=p.clips[0].startMs);
 assert.ok(Math.abs(p.clips[2].startMs-(10000-plan.savedMs))<=1);
 validateProject(p);
 assert.ok(createExportPlan(p).durationMs<20000);
});
test('no speech returns no plan; existing captions/audio block destructive cuts',()=>{
 let p=addAsset(createProject(),video('one'));
 assert.equal(planSilenceRemoval(p.clips[0],[]),null);
 const plan=planSilenceRemoval(p.clips[0],[{startMs:2000,endMs:2200,text:'hi'}]);
 assert.ok(plan);
 const withText={...p,texts:[{id:'c',text:'hi',startMs:0,endMs:2000,x:.5,y:.75,fontSize:32,color:'#FFFFFF'}]};
 assert.throws(()=>applySilenceRemoval(withText,p.clips[0].id,plan),/Remove pauses before/);
});
