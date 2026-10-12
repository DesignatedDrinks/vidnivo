import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset, addText, duplicateProject, validateProject } from '../src/domain/timeline.ts';
test('copy saves a reusable project without shared identities',()=>{
 let base=addAsset(createProject('Brand video','9:16'),{
  id:'asset-original',kind:'video',uri:'file:///local.mp4',
  filename:'original.mp4',durationMs:5000,width:1080,height:1920
 });
 base=addText(base,'Subscribe',1000);
 const copy=duplicateProject(base);
 assert.equal(copy.name,'Brand video (copy)');
 assert.equal(copy.revision,1);
 assert.notEqual(copy.id,base.id);
 assert.notEqual(copy.assets[0].id,base.assets[0].id);
 assert.notEqual(copy.clips[0].id,base.clips[0].id);
 assert.equal(copy.clips[0].assetId,copy.assets[0].id);
 assert.notEqual(copy.texts[0].id,base.texts[0].id);
 assert.equal(copy.assets[0].uri,base.assets[0].uri);
 validateProject(copy);
});

test('copy retains colour grading independently from original',()=>{
 const original={...createProject(),look:{preset:'sunset',intensity:65}};
 const duplicate=duplicateProject(original);
 assert.deepEqual(duplicate.look,original.look);
 assert.notEqual(duplicate.look,original.look);
 duplicate.look.intensity=25;
 assert.equal(original.look.intensity,65);
});
