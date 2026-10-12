import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,editTextLayer} from '../src/domain/timeline.ts';
import {addCaptionCues} from '../src/domain/captions.ts';
import {analyzeCreatorProject} from '../src/domain/creatorReview.ts';
const clip=(id,duration=3000)=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id+'.mp4',durationMs:duration,width:1080,height:1920});
test('empty timeline displays a blocker rather than false green check',()=>{
 const report=analyzeCreatorProject(createProject());
 assert.ok(report.blockers>=1);
 assert.equal(report.canExport,false);
});
test('clean timeline can export and notes captions are optional',()=>{
 const project=addAsset(createProject(),clip('clip'));
 const report=analyzeCreatorProject(project);
 assert.equal(report.blockers,0);
 assert.equal(report.canExport,true);
 assert.ok(report.issues.some(i=>i.id==='no-captions'));
});
test('reports caption overlaps, reading speed, long text and safe zones',()=>{
 let project=addAsset(createProject(),clip('clip'));
 project=addCaptionCues(project,[
  {startMs:100,endMs:290,text:'A very short title.'},
  {startMs:160,endMs:1000,text:'B'.repeat(130)},
  {startMs:2500,endMs:3900,text:'Beyond video'}
 ]);
 project=editTextLayer(project,project.texts[1].id,{y:.91});
 const issues=analyzeCreatorProject(project).issues;
 for(const key of ['fast-captions','caption-overlap','long-captions','safe-zones','captions-past-end'])
  assert.ok(issues.some(i=>i.id===key),key+' must be detected');
});
test('Android unsupported volume is an actual blocker',()=>{
 let project=addAsset(createProject(),clip('clip'));
 project={...project,clips:[{...project.clips[0],volume:.5}]};
 const report=analyzeCreatorProject(project,'android');
 assert.equal(report.canExport,false);
 assert.ok(report.issues.some(i=>i.id.startsWith('export-')&&i.severity==='blocker'));
});
test('video gaps are flagged as review issue',()=>{
 let p=addAsset(addAsset(createProject(),clip('first')),clip('second'));
 p={...p,clips:[p.clips[0],{...p.clips[1],startMs:4200}]};
 const report=analyzeCreatorProject(p);
 assert.ok(report.issues.some(i=>i.id.startsWith('blank')));
});
