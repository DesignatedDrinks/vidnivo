import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedMediaPath} from '../src/mediaPaths.js';
const file={assetId:'aBcD012345',objectPath:'users/creator_42/media/aBcD012345/clip.mp4'};
test('account owner may download only matching media objects',()=>{
 assert.equal(ownedMediaPath(file,'creator_42'),true);
 assert.equal(ownedMediaPath(file,'another_user'),false);
 assert.equal(ownedMediaPath({...file,assetId:'ZZZZ99999'},'creator_42'),false);
});
test('rejects malformed paths, traversal and missing account identity',()=>{
 for(const path of ['users/creator_42/media/aBcD012345/../clip.mp4',
  'users/creator_42/media/aBcD012345/%2e%2e',
  'users/creator_42/media/aBcD012345/folder/clip.mp4',
  'users/creator_42/media/aBcD012345/notes.txt?token=public']){
  assert.equal(ownedMediaPath({...file,objectPath:path},'creator_42'),false);
 }
 assert.equal(ownedMediaPath(file,''),false);
 assert.equal(ownedMediaPath(null,'creator_42'),false);
});
