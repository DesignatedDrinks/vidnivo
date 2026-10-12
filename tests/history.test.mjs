import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset, restoreHistorySnapshot, validateProject } from '../src/domain/timeline.ts';
test('undo increments revision rather than reverting revision number',()=>{
 let initial=createProject('Undo');
 let edited=addAsset(initial,{id:'v1',kind:'video',uri:'file:///v1.mp4',filename:'v1',durationMs:1000,width:1080,height:1920});
 let undone=restoreHistorySnapshot(edited,initial);
 assert.equal(undone.clips.length,0);
 assert.equal(undone.revision,edited.revision+1);
 validateProject(undone);
 let redone=restoreHistorySnapshot(undone,edited);
 assert.equal(redone.clips.length,1);
 assert.equal(redone.revision,undone.revision+1);
});
test('rejects restoring snapshot of a different project',()=>{
 assert.throws(()=>restoreHistorySnapshot(createProject(),createProject()),/different project/);
});
