import {createServer} from 'node:http';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHandler} from './core.mjs';

const port=Number(process.env.PORT||8080);
const bucketName=(process.env.FIREBASE_STORAGE_BUCKET||'').trim();
const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const projectId=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT;
initializeApp({
 credential:applicationDefault(),...(projectId?{projectId}:{}),
 ...(bucketName?{storageBucket:bucketName}:{})
});
const db=getFirestore();
const bucket=bucketName?getStorage().bucket(bucketName):null;
const users=uid=>db.collection('users').doc(uid);
const handler=createHandler({
 allowedOrigins:origins,
 storageReady:!!bucket,
 verifyToken:token=>getAuth().verifyIdToken(token,true),
 getProfile:async uid=>{
  const doc=await users(uid).get();
  return doc.exists?{displayName:doc.data()?.displayName||''}:null;
 },
 saveProfile:async(uid,profile)=>users(uid).set({
  ...profile,updatedAt:FieldValue.serverTimestamp()
 },{merge:true}),
 listMedia:async(uid,after=null,pageSize=50)=>{
  let query=users(uid).collection('media').orderBy(FieldPath.documentId());
  if(after)query=query.startAfter(after);
  const snap=await query.limit(pageSize+1).get();
  const page=snap.docs.slice(0,pageSize);
  return {
   media:page.map(d=>{
    const f=d.data();
    return {assetId:d.id,objectPath:f.objectPath||'',name:f.name||'',
     contentType:f.contentType||'',size:f.size||0};
   }),
   nextCursor:snap.docs.length>pageSize?page[page.length-1].id:null
  };
 },
 getMedia:async(uid,id)=>{
  const doc=await users(uid).collection('media').doc(id).get();
  return doc.exists?doc.data():null;
 },
 checkObject:async path=>{
  if(!bucket)throw Error('Media storage unavailable.');
  const file=bucket.file(path);
  const [data]=await file.getMetadata();
  return {size:Number(data.size||0),contentType:data.contentType||''};
 },
 registerMedia:async(uid,media)=>users(uid).collection('media')
  .doc(media.assetId).create({...media,registeredAt:FieldValue.serverTimestamp()}),
 deleteObject:async path=>{
  if(!bucket)throw Error('Media storage unavailable.');
  await bucket.file(path).delete({ignoreNotFound:true});
 },
 deleteMedia:async(uid,id)=>users(uid).collection('media').doc(id).delete()
});
const server=createServer(handler);
server.headersTimeout=15000;
server.requestTimeout=25000;
server.listen(port,'0.0.0.0',()=>console.log('ROLLBLINK API listening on port '+port));
