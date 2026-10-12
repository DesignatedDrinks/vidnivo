import {createServer} from 'node:http';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHandler,MAX_MEDIA_BYTES} from './core.mjs';

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
 deleteMedia:async(uid,id)=>users(uid).collection('media').doc(id).delete(),
 listProjects:async uid=>{
  const snapshot=await users(uid).collection('projects')
   .orderBy('updatedAt','desc').limit(100).get();
  return snapshot.docs.map(doc=>{
   const p=doc.data();
   return {id:doc.id,name:p.name,updatedAt:p.updatedAt,
    revision:p.revision,version:p.version,mediaCount:p.mediaCount||0};
  });
 },
 getProject:async(uid,id)=>{
  const doc=await users(uid).collection('projects').doc(id).get();
  if(!doc.exists)return null;
  return {project:doc.data()?.project,version:doc.data()?.version};
 },
 saveProject:async(uid,id,project,baseVersion)=>{
  const ref=users(uid).collection('projects').doc(id);
  return db.runTransaction(async transaction=>{
   const found=await transaction.get(ref);
   const version=found.exists?found.data().version:0;
   if(version!==baseVersion)
    throw Object.assign(Error('A newer cloud version exists. Restore and review it before uploading.'),{status:409});
   const next=version+1;
   transaction.set(ref,{project,version:next,name:project.name,
    revision:project.revision,updatedAt:project.updatedAt,
    mediaCount:project.assets.length,savedAt:FieldValue.serverTimestamp()});
   return next;
  });
 },
 uploadMedia:async(uid,id,name,request,contentType,expectedSize)=>{
  if(!bucket)throw Error('Media storage unavailable.');
  const safeName=name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(-120)||'media.bin';
  const objectPath='users/'+uid+'/media/'+id+'/'+safeName;
  const file=bucket.file(objectPath);
  let seen=0,uploaded=false;
  const limit=new Transform({transform(chunk,encoding,callback){
   seen+=chunk.length;
   callback(seen>MAX_MEDIA_BYTES||seen>expectedSize?
    Object.assign(Error('Upload exceeded the expected byte length.'),{status:413}):null,chunk);
  }});
  try{
   await pipeline(request,limit,file.createWriteStream({
    resumable:false,
    preconditionOpts:{ifGenerationMatch:0},
    metadata:{contentType}
   }));
   uploaded=true;
   if(seen!==expectedSize)throw Object.assign(Error('Incomplete media upload.'),{status:400});
   const media={assetId:id,objectPath,name,contentType,size:seen};
   await users(uid).collection('media').doc(id).create({
    ...media,registeredAt:FieldValue.serverTimestamp()
   });
   return media;
  }catch(error){
   if(uploaded)await file.delete({ignoreNotFound:true}).catch(()=>{});
   throw error;
  }
 },
 downloadMedia:async(media,response)=>{
  if(!bucket)throw Error('Media storage unavailable.');
  const file=bucket.file(media.objectPath);
  // Check existence before writing streaming headers to avoid leaking raw errors.
  const [meta]=await file.getMetadata();
  const size=Number(meta.size||0);
  if(!Number.isFinite(size)||size<1||size>MAX_MEDIA_BYTES)
   throw Object.assign(Error('Stored media has an invalid size.'),{status:400});
  response.statusCode=200;
  response.setHeader('Content-Type',media.contentType||'application/octet-stream');
  response.setHeader('Content-Length',String(size));
  response.setHeader('Cache-Control','private, no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Disposition','attachment');
  await pipeline(file.createReadStream(),response);
 }
});
const server=createServer(handler);
server.headersTimeout=15000;
server.requestTimeout=305000;
server.listen(port,'0.0.0.0',()=>console.log('VIDNIVO API listening on port '+port));
