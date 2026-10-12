import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const json=path=>JSON.parse(file(path));
test('Hosting full-stack configuration routes /api before SPA fallback',()=>{
 const config=json('firebase.json');
 assert.equal(config.hosting.public,'web/dist');
 assert.equal(config.hosting.rewrites[0].source,'/api/**');
 assert.equal(config.hosting.rewrites[0].run.serviceId,'vidnivo-api');
 assert.equal(config.hosting.rewrites[1].destination,'/index.html');
});
test('Spark-only Firebase Hosting cannot accidentally provision Cloud Run',()=>{
 const spark=json('firebase.spark.json');
 assert.equal(spark.hosting.public,'web/dist');
 assert.equal(spark.hosting.rewrites.some(r=>'run' in r),false);
 assert.equal(spark.firestore,undefined);
 assert.equal(spark.storage,undefined);
});
test('Firestore rules deny all unrelated documents and private writes',()=>{
 const rules=file('firestore.rules');
 assert.match(rules,/request\.auth\.uid == userId/);
 assert.match(rules,/allow create, update, delete: if false/);
 assert.match(rules,/allow read, write: if false/);
});
test('Cloud Storage rules limit per-user file upload size and MIME types',()=>{
 const rules=file('storage.rules');
 assert.match(rules,/request\.auth\.uid == userId/);
 assert.match(rules,/200 \* 1024 \* 1024/);
 assert.match(rules,/request\.resource\.contentType\.matches/);
 assert.match(rules,/allow update: if false/);
});
test('No admin JSON credential or committed Firebase private key',()=>{
 const files=['firebase.json','firebase.spark.json','firestore.rules','storage.rules',
  'cloud-run/src/index.mjs','web/src/main.js'];
 for(const name of files)assert.doesNotMatch(file(name),/-----BEGIN (?:RSA )?PRIVATE KEY-----/);
});
