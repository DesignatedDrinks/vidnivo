import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/timeline.ts';
import {encodeProjects} from '../src/data/storageCodec.ts';
import {loadProjectLibrary,saveProjectLibrary,PROJECT_KEY,BACKUP_KEY}
  from '../src/data/storageCore.ts';

function memoryStore(values=[],failKey=''){
  const data=new Map(values);
  return {data,
    async getItem(key){return data.has(key)?data.get(key):null},
    async setItem(key,value){if(key===failKey)throw Error('disk full');data.set(key,value)}
  };
}
test('genuine first launch is empty and does not perform a write',async()=>{
 const disk=memoryStore();
 assert.deepEqual(await loadProjectLibrary(disk),[]);
 assert.equal(disk.data.size,0);
});
test('valid primary beats older backup',async()=>{
 const p=createProject('Newest'), old=createProject('Old');
 const disk=memoryStore([[PROJECT_KEY,encodeProjects([p])],[BACKUP_KEY,encodeProjects([old])]]);
 assert.deepEqual(await loadProjectLibrary(disk),[p]);
});
test('a corrupt primary is restored from a validated backup',async()=>{
 const good=createProject('Saved draft'),encoded=encodeProjects([good]);
 const disk=memoryStore([[PROJECT_KEY,'{corrupt'],[BACKUP_KEY,encoded]]);
 assert.deepEqual(await loadProjectLibrary(disk),[good]);
 assert.equal(disk.data.get(PROJECT_KEY),encoded);
});
test('a missing primary with a valid backup is recoverable',async()=>{
 const saved=encodeProjects([createProject('Recovered')]);
 const disk=memoryStore([[BACKUP_KEY,saved]]);
 assert.equal((await loadProjectLibrary(disk)).length,1);
 assert.equal(disk.data.get(PROJECT_KEY),saved);
});
test('both corrupt or missing backup never silently become an empty project list',async()=>{
 const a=memoryStore([[PROJECT_KEY,'bad json']]);
 await assert.rejects(()=>loadProjectLibrary(a),/backup is available/);
 assert.equal(a.data.get(PROJECT_KEY),'bad json');
 const b=memoryStore([[PROJECT_KEY,'garbled'],[BACKUP_KEY,'broken']]);
 await assert.rejects(()=>loadProjectLibrary(b),/both|Both/);
 assert.equal(b.data.get(PROJECT_KEY),'garbled');
});
test('a backup write failure blocks update to the original valid primary',async()=>{
 const old=encodeProjects([createProject('First')]);
 const disk=memoryStore([[PROJECT_KEY,old]],BACKUP_KEY);
 await assert.rejects(()=>saveProjectLibrary(disk,[createProject('Second')]),/disk full/);
 assert.equal(disk.data.get(PROJECT_KEY),old);
});
test('saving a newer draft protects previous known-good copy',async()=>{
 const first=createProject('First'),second=createProject('Second');
 const disk=memoryStore();
 await saveProjectLibrary(disk,[first]);
 await saveProjectLibrary(disk,[first,second]);
 assert.deepEqual(JSON.parse(disk.data.get(BACKUP_KEY)),[first]);
 assert.equal(JSON.parse(disk.data.get(PROJECT_KEY)).length,2);
});
test('saving rejects corrupted primary instead of overwriting potential evidence',async()=>{
 const disk=memoryStore([[PROJECT_KEY,'not json'],[BACKUP_KEY,encodeProjects([createProject('Backup')])]]);
 await assert.rejects(()=>saveProjectLibrary(disk,[]),/blocked/);
 assert.equal(disk.data.get(PROJECT_KEY),'not json');
});
