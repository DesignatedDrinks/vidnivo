import {validateCloudProject} from './projectCore.mjs';
const LIMIT=512*1024;
const ASSET_ID=/^[A-Za-z0-9_-]{8,80}$/;
const NAME=/^[^\\/\u0000-\u001f\u007f]{1,180}$/;
const PATH=/^users\/([A-Za-z0-9_-]{1,128})\/media\/([A-Za-z0-9_-]{8,80})\/([A-Za-z0-9_.-]{1,120})$/;
const KIND=/^(video|image|audio)\/[A-Za-z0-9.+-]+$/;
export const MAX_MEDIA_BYTES=200*1024*1024;
const errors={
 400:'Invalid request.',401:'Sign in required.',403:'Not authorized.',
 404:'Endpoint not found.',405:'Method not allowed.',
 409:'Media identifier already registered to another file.',
 413:'Request too large.',415:'Content type must be application/json.',
 503:'Cloud media storage is not configured.'
};
function send(response,status,data,origin,allowedOrigins){
 response.statusCode=status;
 response.setHeader('Content-Type','application/json; charset=utf-8');
 response.setHeader('Cache-Control','no-store');
 response.setHeader('X-Content-Type-Options','nosniff');
 response.setHeader('Vary','Origin');
 if(origin && allowedOrigins.includes(origin))
  response.setHeader('Access-Control-Allow-Origin',origin);
 response.end(JSON.stringify(data));
}
async function bodyJson(req){
 if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))
  throw Object.assign(Error('Expected JSON.'),{status:415});
 let total=0,parts=[];
 for await(const part of req){
  total+=part.length;
  if(total>LIMIT)throw Object.assign(Error('Request too large.'),{status:413});
  parts.push(part);
 }
 let value;
 try{value=JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch{throw Object.assign(Error('Invalid JSON request.'),{status:400});}
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw Object.assign(Error('Request body must be an object.'),{status:400});
 return value;
}
export function validateRegistration(uid,raw){
 const {assetId,objectPath,name}=raw;
 if(typeof uid!=='string'||!uid||!ASSET_ID.test(assetId||''))
  throw Object.assign(Error('Invalid media identifier.'),{status:400});
 const match=typeof objectPath==='string'?PATH.exec(objectPath):null;
 if(!match||match[1]!==uid||match[2]!==assetId||
    typeof name!=='string'||!NAME.test(name))
  throw Object.assign(Error('Media path must belong to the signed-in account.'),{status:403});
 return {assetId,objectPath,name};
}
/**
 * API dependencies are injected to make isolation, authorization, and
 * project-independent cloud features testable without live credentials.
 * Firestore is a supplementary customer/media registry. Google Sheets
 * remains the editor's original metadata database.
 */
export function createHandler({verifyToken,getProfile,saveProfile,listMedia,getMedia,
 checkObject,registerMedia,deleteObject,deleteMedia,
 listProjects,getProject,saveProject,uploadMedia,downloadMedia,storageReady=true,allowedOrigins=[]}){
 if(!verifyToken||!getProfile||!saveProfile||!listMedia||!getMedia||
    !checkObject||!registerMedia||!deleteObject||!deleteMedia||
    !listProjects||!getProject||!saveProject||!uploadMedia||!downloadMedia)
    throw Error('API dependencies missing.');
 return async function handle(req,res){
  const origin=req.headers.origin||'';
  if(origin && !allowedOrigins.includes(origin)){
   send(res,403,{error:'This web origin is not authorized.'},origin,allowedOrigins);return;
  }
  if(req.method==='OPTIONS'){
   res.statusCode=204;
   res.setHeader('Vary','Origin');
   if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
   res.setHeader('Access-Control-Allow-Methods','GET, PUT, POST, DELETE, OPTIONS');
   res.setHeader('Access-Control-Max-Age','600');
   res.end();return;
  }
  const path=(req.url||'/').split('?')[0];
  if(req.method==='GET' && path==='/api/healthz'){
   send(res,200,{status:'ok',service:'vidnivo-api'},origin,allowedOrigins);return;
  }
  if(!path.startsWith('/api/v1/')){
   send(res,404,{error:errors[404]},origin,allowedOrigins);return;
  }
  if(!['GET','PUT','POST','DELETE'].includes(req.method||'')){
   send(res,405,{error:errors[405]},origin,allowedOrigins);return;
  }
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')||auth.length>8192){
   send(res,401,{error:errors[401]},origin,allowedOrigins);return;
  }
  let verified;
  try{verified=await verifyToken(auth.slice(7));}
  catch{send(res,401,{error:'Your session expired. Sign in again.'},origin,allowedOrigins);return;}
  const uid=verified?.uid;
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)){
   send(res,401,{error:errors[401]},origin,allowedOrigins);return;
  }
  try{
   if(req.method==='GET'&&path==='/api/v1/me'){
    const profile=await getProfile(uid);
    send(res,200,{uid,profile:profile||null},origin,allowedOrigins);return;
   }
   if(req.method==='PUT'&&path==='/api/v1/me'){
    const payload=await bodyJson(req);
    if(Object.keys(payload).some(key=>key!=='displayName')||
       typeof payload.displayName!=='string'||
       payload.displayName.trim().length<1||payload.displayName.trim().length>80||
       /[\u0000-\u001f\u007f]/.test(payload.displayName))
       throw Object.assign(Error('Display name must be 1–80 characters.'),{status:400});
    const displayName=payload.displayName.trim();
    await saveProfile(uid,{displayName});
    send(res,200,{uid,displayName},origin,allowedOrigins);return;
   }
   if(req.method==='GET'&&path==='/api/v1/media'){
    const after=new URL(req.url||'/', 'http://localhost').searchParams.get('after');
    if(after!==null&&!ASSET_ID.test(after))
     throw Object.assign(Error('Invalid media page cursor.'),{status:400});
    const page=await listMedia(uid,after,50);
    send(res,200,page,origin,allowedOrigins);return;
   }
   if(req.method==='POST'&&path==='/api/v1/media/register'){
    if(!storageReady)throw Object.assign(Error(errors[503]),{status:503});
    const input=validateRegistration(uid,await bodyJson(req));
    const previous=await getMedia(uid,input.assetId);
    if(previous && previous.objectPath!==input.objectPath)
     throw Object.assign(Error(errors[409]),{status:409});
    const item=await checkObject(input.objectPath);
    if(!KIND.test(item.contentType||'')||!(item.size>0)||
       item.size>MAX_MEDIA_BYTES)
     throw Object.assign(Error('Media must be an audio, photo, or video file smaller than 200 MB.'),{status:400});
    const record={...input,contentType:item.contentType,size:item.size};
    if(!previous)await registerMedia(uid,record);
    send(res,200,{assetId:input.assetId,registered:true},origin,allowedOrigins);return;
   }
   // Cloud projects carry cloud:// media IDs, never another phone's file:// paths.
   // Optimistic versions prevent a stale second phone overwriting the first.
   if(req.method==='GET'&&path==='/api/v1/projects'){
    const projects=await listProjects(uid);
    send(res,200,{projects},origin,allowedOrigins);return;
   }
   const projectRoute=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]{8,80})$/);
   if(projectRoute&&req.method==='GET'){
    const record=await getProject(uid,projectRoute[1]);
    if(!record){send(res,404,{error:'Project not found.'},origin,allowedOrigins);return;}
    send(res,200,{project:record.project,version:record.version},origin,allowedOrigins);return;
   }
   if(projectRoute&&req.method==='PUT'){
    const input=await bodyJson(req);
    if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<0)
     throw Object.assign(Error('A nonnegative cloud version is required.'),{status:400});
    const portable=validateCloudProject(input.project,projectRoute[1]);
    for(const asset of portable.assets){
     const registration=await getMedia(uid,asset.id);
     if(!registration)throw Object.assign(
      Error('Upload every project media file before backing up the timeline.'),{status:409});
     validateRegistration(uid,{assetId:asset.id,...registration});
    }
    const version=await saveProject(uid,projectRoute[1],portable,input.baseVersion);
    send(res,200,{id:portable.id,version},origin,allowedOrigins);return;
   }
   const mediaUpload=path.match(/^\/api\/v1\/media\/([A-Za-z0-9_-]{8,80})\/upload$/);
   if(req.method==='PUT'&&mediaUpload){
    if(!storageReady)throw Object.assign(Error(errors[503]),{status:503});
    const rawName=req.headers['x-vidnivo-filename'];
    const name=typeof rawName==='string'?rawName:'';
    const contentType=(req.headers['content-type']||'').toLowerCase();
    const size=Number(req.headers['content-length']);
    if(!NAME.test(name)||!KIND.test(contentType)||
       !Number.isSafeInteger(size)||size<=0||size>MAX_MEDIA_BYTES)
     throw Object.assign(Error('Invalid media file name, type or size (maximum 200 MB).'),{status:400});
    const assetId=mediaUpload[1];
    const existing=await getMedia(uid,assetId);
    if(existing){
     validateRegistration(uid,{assetId,...existing});
     if(existing.name!==name)throw Object.assign(
      Error('Media identifier already registered to another file.'),{status:409});
     send(res,200,{assetId,registered:true,alreadyUploaded:true},origin,allowedOrigins);return;
    }
    const stored=await uploadMedia(uid,assetId,name,req,contentType,size);
    send(res,201,{assetId,registered:true,size:stored.size},origin,allowedOrigins);return;
   }
   const mediaDownload=path.match(/^\/api\/v1\/media\/([A-Za-z0-9_-]{8,80})\/download$/);
   if(req.method==='GET'&&mediaDownload){
    if(!storageReady)throw Object.assign(Error(errors[503]),{status:503});
    const assetId=mediaDownload[1],existing=await getMedia(uid,assetId);
    if(!existing){send(res,404,{error:'Media file not found.'},origin,allowedOrigins);return;}
    validateRegistration(uid,{assetId,...existing});
    await downloadMedia(existing,res);return;
   }
   // The server, never the browser, performs both sides of deletion.
   // If removing Firestore fails, a retry is safe because object deletion
   // tolerates a file which was already removed.
   const deletion=path.match(/^\/api\/v1\/media\/([A-Za-z0-9_-]{8,80})$/);
   if(req.method==='DELETE'&&deletion){
    if(!storageReady)throw Object.assign(Error(errors[503]),{status:503});
    const assetId=deletion[1];
    const previous=await getMedia(uid,assetId);
    if(!previous){
     send(res,404,{error:'Media asset not found.'},origin,allowedOrigins);return;
    }
    // Defend against corrupted or improperly owned registry records.
    validateRegistration(uid,{assetId,...previous});
    await deleteObject(previous.objectPath);
    await deleteMedia(uid,assetId);
    send(res,200,{assetId,deleted:true},origin,allowedOrigins);return;
   }
   send(res,404,{error:errors[404]},origin,allowedOrigins);
  }catch(error){
   const status=Number.isInteger(error?.status) && error.status>=400 && error.status<600
    ?error.status:500;
   // Streams may already have sent response headers; never write JSON mid-file.
   if(res.headersSent){res.destroy();return;}
   // Never echo provider errors, stack traces or credentials to the client.
   send(res,status,{error:status===500?'Service temporarily unavailable. Please retry.':error.message},
    origin,allowedOrigins);
  }
 };
}
