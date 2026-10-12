import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('client storage keys and Firebase config are never service account credentials',()=>{
 const config=readFileSync('src/cloud/firebaseClient.ts','utf8');
 assert.ok(config.includes('EXPO_PUBLIC_FIREBASE_API_KEY'));
 assert.ok(!config.includes('private_key'));
 assert.ok(!config.includes('applicationDefault()'));
});
test('private media upload validates size, identity, and uses Firebase storage rules',()=>{
 const src=readFileSync('src/cloud/mediaUpload.ts','utf8');
 assert.ok(src.includes("25*1024*1024"));
 assert.ok(src.includes("file.arrayBuffer()"));
 assert.ok(src.includes("uploadBytesResumable"));
 assert.ok(src.includes("users/"));
});
