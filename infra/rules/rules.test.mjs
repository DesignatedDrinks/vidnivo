import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
 from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,collection,getDocs} from 'firebase/firestore';
import {ref,uploadBytes,getMetadata} from 'firebase/storage';

let testEnv;
const owner='creator_A',stranger='creator_B';
const mediaId='0123456789abcdef';
const assetPath='users/'+owner+'/media/'+mediaId+'/sample.mp4';
before(async()=>{
 testEnv=await initializeTestEnvironment({
  projectId:'demo-vidnivo',
  firestore:{rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')},
  storage:{rules:readFileSync(new URL('../../storage.rules',import.meta.url),'utf8')}
 });
 await testEnv.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'users',owner),{displayName:'Creator A'});
  await setDoc(doc(ctx.firestore(),'users',owner,'projects','project_001'),{name:'A draft',version:1});
  await setDoc(doc(ctx.firestore(),'users',owner,'media',mediaId),{name:'sample.mp4',size:8});
 });
});
after(async()=>{if(testEnv)await testEnv.cleanup();});
test('Firestore denies unauthenticated and cross-account profile reads',async()=>{
 const a=testEnv.authenticatedContext(owner).firestore();
 const b=testEnv.authenticatedContext(stranger).firestore();
 const unauth=testEnv.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(a,'users',owner)));
 await assertFails(getDoc(doc(b,'users',owner)));
 await assertFails(getDoc(doc(unauth,'users',owner)));
});
test('Firestore denies direct browser writes, even to your own profile',async()=>{
 const a=testEnv.authenticatedContext(owner).firestore();
 await assertFails(setDoc(doc(a,'users',owner),{displayName:'Changed'}));
 await assertFails(setDoc(doc(a,'users',owner,'media','untrusted'),{name:'forged'}));
 await assertSucceeds(getDocs(collection(a,'users',owner,'media')));
});
test('Storage is owner-readable, but denies ALL client uploads and deletes',async()=>{
 const a=testEnv.authenticatedContext(owner).storage();
 const b=testEnv.authenticatedContext(stranger).storage();
 const anon=testEnv.unauthenticatedContext().storage();
 await testEnv.withSecurityRulesDisabled(ctx=>uploadBytes(ref(ctx.storage(),assetPath),
  new Uint8Array(8),{contentType:'video/mp4'}));
 await assertSucceeds(getMetadata(ref(a,assetPath)));
 await assertFails(getMetadata(ref(b,assetPath)));
 await assertFails(getMetadata(ref(anon,assetPath)));
 await assertFails(uploadBytes(ref(a,assetPath+'-new'),new Uint8Array(8),{contentType:'video/mp4'}));
 await assertFails(uploadBytes(ref(b,assetPath+'-new'),new Uint8Array(8),{contentType:'video/mp4'}));
});
test('Storage blocks unsupported MIME and path traversal',async()=>{
 const a=testEnv.authenticatedContext(owner).storage();
 await assertFails(uploadBytes(ref(a,'users/'+owner+'/media/AAAAAAAAAAAAAAA/notes.txt'),
  new Uint8Array(8),{contentType:'text/plain'}));
 await assertFails(uploadBytes(ref(a,'users/'+owner+'/media/x/clip.mp4'),
  new Uint8Array(8),{contentType:'video/mp4'}));
});

test('Firestore cloud projects are strictly isolated by account',async()=>{
 const ownerDb=testEnv.authenticatedContext(owner).firestore();
 const otherDb=testEnv.authenticatedContext(stranger).firestore();
 const anonymous=testEnv.unauthenticatedContext().firestore();
 const project=doc(ownerDb,'users',owner,'projects','project_001');
 await assertSucceeds(getDoc(project));
 await assertSucceeds(getDocs(collection(ownerDb,'users',owner,'projects')));
 await assertFails(getDoc(doc(otherDb,'users',owner,'projects','project_001')));
 await assertFails(getDocs(collection(otherDb,'users',owner,'projects')));
 await assertFails(getDoc(doc(anonymous,'users',owner,'projects','project_001')));
 await assertFails(setDoc(doc(ownerDb,'users',owner,'projects','project_001'),
  {name:'Unauthorized rewrite',version:100}));
});
