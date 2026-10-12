import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const txt=(path)=>readFileSync(path,'utf8');
test('Firebase config separates static Hosting, identity rules, and paid storage',()=>{
 const config=JSON.parse(txt('firebase.json'));
 assert.equal(config.hosting.public,'web');
 assert.equal(config.firestore.rules,'firestore.rules');
 assert.equal(config.storage.rules,'storage.rules');
 for(const file of ['web/index.html','web/site.css','web/site.js','firestore.rules','storage.rules'])
  assert.ok(existsSync(file),file);
});
test('Firestore direct writes are disabled and private media paths are owner-scoped',()=>{
 const firestore=txt('firestore.rules'),storage=txt('storage.rules');
 assert.match(firestore,/allow list, create, update, delete: if false;/);
 assert.match(firestore,/request.auth.uid == uid/);
 assert.match(storage,/request.auth.uid == uid/);
 assert.match(storage,/allow update: if false;/);
 assert.match(storage,/request.resource.size <= 262144000/);
 assert.ok(!storage.includes('allow read, write: if true'));
});
test('deployment requires human confirmation and does not enable spend without consent',()=>{
 for(const file of ['deploy/cloudrun.sh','deploy/firebase-hosting.sh',
  'deploy/firebase-database-rules.sh','deploy/firebase-storage-rules.sh']){
  assert.match(txt(file),/read -r -p/,file);
 }
 assert.match(txt('deploy/cloudrun.sh'),/--min-instances 0 --max-instances 2/);
});
test('Cloud API auth endpoints do not accept arbitrary user ID from JSON payload',()=>{
 const source=txt('cloudrun/api/src/handler.mjs');
 assert.match(source,/verifyIdToken/);
 assert.match(source,/Object.keys\(body\).length !== 1/);
 assert.match(source,/Authorization|authorization/);
});
