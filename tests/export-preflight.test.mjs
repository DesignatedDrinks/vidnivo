import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,editClip} from '../src/domain/timeline.ts';
import {exportPreflight} from '../src/export/preflight.ts';
const a={id:'v1',kind:'video',uri:'file:///a.mp4',filename:'a.mp4',durationMs:10000,width:1080,height:1920};
test('clear platform-specific export checks instead of silent missing sound',()=>{
 let p=addAsset(createProject(),a);
 assert.equal(exportPreflight(p,'ios').errors.length,0);
 assert.equal(exportPreflight(p,'android').errors.length,0);
 p=editClip(p,p.clips[0].id,{volume:.5});
 assert.equal(exportPreflight(p,'ios').errors.length,0);
 assert.match(exportPreflight(p,'android').errors[0],/100% volume/);
 p=editClip(p,p.clips[0].id,{muted:true});
 assert.equal(exportPreflight(p,'android').errors.length,0);
});
test('invalid project produces a readable blocking error',()=>{
 const result=exportPreflight(createProject(),'ios');
 assert.ok(result.errors.length);
 assert.equal(result.plan,null);
});
