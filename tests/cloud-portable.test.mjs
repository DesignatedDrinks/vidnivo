import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,validateProject,duplicateProject} from '../src/domain/timeline.ts';
import {toPortableProject,installPortableProject} from '../src/cloud/portable.ts';
test('cross-device backup never publishes a local phone file URI',()=>{
 let project=createProject('Creator test');
 project=addAsset(project,{id:'asset_12345',kind:'video',uri:'file:///private/clip.mp4',
  filename:'clip.mp4',durationMs:10000,width:720,height:1280});
 project=addText(project,'A caption',1000,2000);
 const portable=toPortableProject({...project,cloudVersion:2});
 assert.equal(portable.assets[0].uri,'cloud://asset_12345');
 assert.equal(portable.cloudVersion,undefined);
 assert.deepEqual(portable.clips,project.clips);
 assert.deepEqual(portable.texts,project.texts);
 const restored=installPortableProject(portable,
  {'asset_12345':'file:///another-phone/download.mp4'},3);
 assert.equal(restored.assets[0].uri,'file:///another-phone/download.mp4');
 assert.equal(restored.cloudVersion,3);
 validateProject(restored);
 const fork=duplicateProject(restored);
 assert.notEqual(fork.id,restored.id);
 assert.equal(fork.cloudVersion,undefined);
});
test('restore refuses missing, remote or mismatched media references',()=>{
 let project=createProject('Test');
 project=addAsset(project,{id:'asset_ABC123',kind:'image',uri:'file:///one/photo.jpg',
  filename:'photo.jpg',durationMs:3000,width:1280,height:720});
 const portable=toPortableProject(project);
 assert.throws(()=>installPortableProject(portable,{},1),/safely restored/);
 assert.throws(()=>installPortableProject(portable,{'asset_ABC123':'https://evil'},1));
 assert.throws(()=>installPortableProject({...portable,assets:[
  {...portable.assets[0],uri:'file:///stolen'}]},
  {'asset_ABC123':'file:///another/clip.jpg'},1));
 assert.throws(()=>installPortableProject(portable,{'asset_ABC123':'file:///fine'},0));
});
test('never re-upload a cloud-only project without restored source files',()=>{
 const project=createProject('Test');
 const bad={...project,assets:[{id:'asset_ABCDE',kind:'audio',filename:'music.m4a',
  uri:'cloud://asset_ABCDE',durationMs:2000,width:0,height:0}]};
 assert.throws(()=>toPortableProject(bad));
});
