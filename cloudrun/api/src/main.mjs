import {createServer} from 'node:http';
import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createApiHandler} from './handler.mjs';

const projectId=process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw Error('Set GOOGLE_CLOUD_PROJECT or FIREBASE_PROJECT_ID.');
const app=getApps().length?getApps()[0]:initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(app),db=getFirestore(app);

const handler=createApiHandler({
 verifyIdToken:(token)=>auth.verifyIdToken(token,true),
 async readProfile(uid) {
  const snapshot=await db.collection('users').doc(uid).get();
  if(!snapshot.exists)return null;
  const p=snapshot.data()||{};
  return {displayName:p.displayName||'',createdAt:p.createdAt?.toDate?.()?.toISOString?.()||null,
   updatedAt:p.updatedAt||null};
 },
 async updateProfile(uid,{displayName,updatedAt}) {
  const ref=db.collection('users').doc(uid);
  await ref.set({displayName,updatedAt,createdAt:FieldValue.serverTimestamp()}, {merge:true});
 },
 allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)
});
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<=0||port>65535)throw Error('Invalid PORT.');
const server=createServer(handler);
server.requestTimeout=30000;
server.headersTimeout=20000;
server.listen(port,'0.0.0.0',()=>console.log('VIDNIVO API listening on port '+port));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
