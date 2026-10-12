import {createServer} from 'node:http';
import {pipeline} from 'node:stream/promises';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHandler,MAX_MEDIA_BYTES} from './core.mjs';
import {writeBoundedMedia} from './mediaStream.mjs';
import {diagnoseWithOpenAI} from './supportCore.mjs';

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
const quotaRef=uid=>users(uid).collection('_system').doc('storageQuota');
const MAX_ACCOUNT_BYTES=2*1024*1024*1024;
const MAX_ACCOUNT_ASSETS=400;
async function reserveMedia(uid,id,media){
 const fileRef=users(uid).collection('media').doc(id),counter=quotaRef(uid);
 await db.runTransaction(async tx=>{
  const [existing,usage]=await Promise.all([tx.get(fileRef),tx.get(counter)]);
  if(existing.exists)throw Object.assign(Error('Media identifier is already in use.'),{status:409});
  const bytes=usage.exists?usage.data().bytes:0;
  const assets=usage.exists?usage.data().assets:0;
  if(!Number.isSafeInteger(bytes)||!Number.isSafeInteger(assets)||bytes<0||assets<0)
   throw Object.assign(Error('Cloud quota accounting needs administrator repair.'),{status:503});
  if(bytes+media.size>MAX_ACCOUNT_BYTES||assets+1>MAX_ACCOUNT_ASSETS)
   throw Object.assign(Error('Cloud storage quota reached. Remove unused uploads before adding more media.'),{status:413});
  tx.create(fileRef,{...media,state:'uploading',quotaTracked:true,
   reservedAt:FieldValue.serverTimestamp()});
  tx.set(counter,{bytes:bytes+media.size,assets:assets+1,
   updatedAt:FieldValue.serverTimestamp()},{merge:true});
 });
 return fileRef;
}
async function releaseMediaReservation(uid,id){
 const fileRef=users(uid).collection('media').doc(id),counter=quotaRef(uid);
 await db.runTransaction(async tx=>{
  const [registered,usage]=await Promise.all([tx.get(fileRef),tx.get(counter)]);
  if(!registered.exists||registered.data().state!=='uploading')return;
  const size=registered.data().size;
  const old=usage.exists?usage.data():{};
  if(!Number.isSafeInteger(size)||!Number.isSafeInteger(old.bytes)||
    !Number.isSafeInteger(old.assets)||old.bytes<size||old.assets<1)
   throw Object.assign(Error('Cloud quota accounting needs administrator repair.'),{status:503});
  tx.delete(fileRef);
  tx.update(counter,{bytes:old.bytes-size,assets:old.assets-1,
   updatedAt:FieldValue.serverTimestamp()});
 });
}
// Per-owner, transactional cost budget; an authenticated mobile client
// cannot submit unbounded paid model requests.
async function reserveSupportRequest(uid){
 const now=Date.now(),period=Math.floor(now/3600000);
 const ref=users(uid).collection('_system').doc('supportLimit');
 await db.runTransaction(async tx=>{
  const found=await tx.get(ref);
  const previous=found.exists?found.data():{};
  const count=previous.period===period?previous.count||0:0;
  if(count>=12)throw Object.assign(Error('AI help limit reached. Try again later.'),{status:429});
  tx.set(ref,{period,count:count+1,updatedAt:FieldValue.serverTimestamp()});
 });
}
const handler=createHandler({
 allowedOrigins:origins,
 storageReady:!!bucket,
 resolveSupport:async(uid,input)=>{
  const key=(process.env.OPENAI_SUPPORT_API_KEY||'').trim();
  // Without a configured model, return deterministic help for free.
  if(key)await reserveSupportRequest(uid);
  return diagnoseWithOpenAI(input,{apiKey:key,model:process.env.OPENAI_SUPPORT_MODEL||'gpt-5-mini'});
 },
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
     contentType:f.contentType||'',size:f.size||0,md5Hex:f.md5Hex||null,
     state:f.state||'ready'};
   }),
   nextCursor:snap.docs.length>pageSize?page[page.length-1].id:null
  };
 },
 getMedia:async(uid,id)=>{
  const doc=await users(uid).collection('media').doc(id).get();
  return doc.exists&&doc.data()?.state!=='uploading'?doc.data():null;
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
 deleteMedia:async(uid,id)=>{
  const mediaRef=users(uid).collection('media').doc(id),counter=quotaRef(uid);
  await db.runTransaction(async tx=>{
   const [media,usage]=await Promise.all([tx.get(mediaRef),tx.get(counter)]);
   if(!media.exists)return;
   if(media.data().quotaTracked){
    const old=usage.exists?usage.data():{},size=media.data().size;
    if(!Number.isSafeInteger(old.bytes)||!Number.isSafeInteger(old.assets)||
      !Number.isSafeInteger(size)||old.bytes<size||old.assets<1)
     throw Object.assign(Error('Cloud quota accounting needs administrator repair.'),{status:503});
    tx.update(counter,{bytes:old.bytes-size,assets:old.assets-1,
     updatedAt:FieldValue.serverTimestamp()});
   }
   tx.delete(mediaRef);
  });
 },
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
  const doc=await reserveMedia(uid,id,{assetId:id,objectPath,name,contentType,size:expectedSize});
  let uploaded=false,cleanupAllowed=true;
  try{
   const seen=await writeBoundedMedia(request,file.createWriteStream({
    resumable:false,
    preconditionOpts:{ifGenerationMatch:0},
    metadata:{contentType}
   }),expectedSize,MAX_MEDIA_BYTES,()=>{uploaded=true;});
   const [metadata]=await file.getMetadata();
   const hash=metadata.md5Hash;
   if(!hash||!Number.isSafeInteger(Number(metadata.size))||Number(metadata.size)!==seen)
    throw Object.assign(Error('Media storage checksum or length is unavailable.'),{status:503});
   const md5Hex=Buffer.from(hash,'base64').toString('hex');
   if(!/^[a-f0-9]{32}$/.test(md5Hex))
    throw Object.assign(Error('Invalid media storage checksum.'),{status:503});
   await doc.update({state:'ready',md5Hex,registeredAt:FieldValue.serverTimestamp()});
   return {size:seen,md5Hex};
  }catch(error){
   try{
    // Only release reserved bytes when the object has been successfully
    // cleaned up. Leaked reservations fail closed rather than overspend.
    // A failed create with precondition 412 may indicate another owned object;
    // do not delete an object the current request did not create.
    if(uploaded)await file.delete({ignoreNotFound:true});
    else cleanupAllowed=false;
    if(cleanupAllowed)await releaseMediaReservation(uid,id);
   }catch{/* Reserve quota for administrator recovery rather than undercount bytes. */}
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
