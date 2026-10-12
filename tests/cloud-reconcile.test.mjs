import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset} from '../src/domain/timeline.ts';
import {reconcileCloudProjects} from '../src/data/cloudReconcile.ts';
const video=(id,uri)=>({id,kind:'video',uri,filename:id+'.mp4',durationMs:3000,width:1080,height:1920});
test('do not overwrite usable local project with new revision pointing to missing remote phone files',()=>{
 const original=addAsset(createProject('Important draft'),video('v1','file:///this-phone/a.mp4'));
 const remote={...original,revision:original.revision+2,assets:[{...original.assets[0],uri:'file:///another-phone/a.mp4'}]};
 const result=reconcileCloudProjects([original],[remote],uri=>uri.includes('this-phone'));
 assert.equal(result.applied,0);
 assert.deepEqual(result.projects,[original]);
 assert.equal(result.skipped.length,1);
});
test('remote revisions may import when all referenced media is actually present',()=>{
 const initial=addAsset(createProject('Original'),video('v1','file:///here/video.mp4'));
 const revised={...initial,revision:initial.revision+1,name:'Revised'};
 const result=reconcileCloudProjects([initial],[revised],uri=>uri.startsWith('file:///here/'));
 assert.equal(result.applied,1);
 assert.equal(result.projects[0].name,'Revised');
});
test('cloud project without source media can still be created as a draft',()=>{
 const blank=createProject('Empty template');
 const result=reconcileCloudProjects([],[blank],()=>{throw Error('not called');});
 assert.equal(result.applied,1);
 assert.equal(result.projects.length,1);
});
test('newer local revision takes precedence, preventing stale cloud overwrite',()=>{
 const local=createProject('Recent edits');
 const remote={...local,revision:local.revision-1,name:'Old edits'};
 const result=reconcileCloudProjects([local],[remote],()=>true);
 assert.equal(result.applied,0);
 assert.equal(result.projects[0].name,'Recent edits');
});
test('a remote project with nonlocal HTTP media is skipped',()=>{
 const remote=addAsset(createProject(),video('v1','https://example.com/video.mp4'));
 const result=reconcileCloudProjects([],[remote],()=>true);
 assert.equal(result.applied,0);
 assert.equal(result.skipped.length,1);
});
