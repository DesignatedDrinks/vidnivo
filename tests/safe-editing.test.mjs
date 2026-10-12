import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,splitClip,moveClip} from '../src/domain/timeline.ts';
import {attemptProjectEdit} from '../src/domain/safeEditing.ts';
const video={id:'v1',kind:'video',uri:'file:///video.mp4',filename:'video.mp4',durationMs:4000,width:1080,height:1920};
test('valid editing action commits a validated project',()=>{
 const p=createProject();
 const result=attemptProjectEdit(p,current=>addAsset(current,video));
 assert.equal(result.status,'applied');
 assert.equal(result.project.clips.length,1);
 assert.equal(p.clips.length,0);
});
test('out-of-range split never crashes or modifies the previous draft',()=>{
 const p=addAsset(createProject(),video);
 const result=attemptProjectEdit(p,current=>splitClip(current,current.clips[0].id,-1000));
 assert.equal(result.status,'rejected');
 assert.equal(result.project,p);
 assert.match(result.message,/previous version was kept/);
});
test('malformed operation is rejected before undo or persistence',()=>{
 const p=addAsset(createProject(),video);
 const result=attemptProjectEdit(p,current=>({...current,clips:[{...current.clips[0],speed:NaN}]}));
 assert.equal(result.status,'rejected');
 assert.equal(result.project,p);
});
test('no-op editing actions do not consume undo history',()=>{
 const p=addAsset(createProject(),video);
 const result=attemptProjectEdit(p,current=>current);
 assert.equal(result.status,'unchanged');
 assert.equal(result.project,p);
});
