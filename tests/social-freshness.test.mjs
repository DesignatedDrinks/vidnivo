import test from 'node:test';
import assert from 'node:assert/strict';
import {isSocialDraftCurrent,assertSocialDraftCurrent} from '../src/social/freshness.ts';
test('publishing requires copy generated for current video revision',()=>{
 assert.equal(isSocialDraftCurrent(4,4),true);
 for(const revision of [null,3,5,0,-1,NaN]){
  assert.equal(isSocialDraftCurrent(4,revision),false);
  assert.throws(()=>assertSocialDraftCurrent(4,revision),/Regenerate/);
 }
 assert.doesNotThrow(()=>assertSocialDraftCurrent(4,4));
});
test('editing an old draft is not evidence of transcript re-generation',()=>{
 let generatedRevision=5;
 const currentRevision=7;
 const editedCaption='A correction to the previous copy';
 assert.ok(editedCaption.length>0);
 assert.equal(isSocialDraftCurrent(currentRevision,generatedRevision),false);
 assert.equal(generatedRevision,5);
});
