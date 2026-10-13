/* Rollblink single-owner beta social publishing. Official OAuth and provider APIs.
   Requires one trusted backend instance, persistent volume and secrets; see README. */
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,stat,unlink,open,readdir} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {join} from 'node:path';

const env=process.env;
const API_BASE=(env.PUBLIC_BASE_URL||env.RENDER_EXTERNAL_URL||'').replace(/\/$/,'');
const ORIGIN=(env.ROLLBLINK_EDITOR_ORIGIN||'https://designateddrinks.github.io');
const MEDIA_DIR=env.MEDIA_DIR||'/tmp/rollblink-media';
const STORE_FILE=env.SOCIAL_TOKEN_FILE||'/tmp/rollblink-social-tokens.enc';
const MAX_VIDEO=200*1024*1024,MEDIA_TTL=48*3600*1000;
const GRAPH='https://graph.instagram.com/'+(env.INSTAGRAM_GRAPH_VERSION||'v25.0');
const platformNames=['instagram','youtube','tiktok'];
const pendingStates=new Map();
let savedTokens=null;
const privateKeySecret=env.ROLLBLINK_TOKEN_ENCRYPTION_KEY||'';
const encryptionKey=privateKeySecret.length>=32?createHash('sha256').update(privateKeySecret).digest():null;
const clients={
 instagram:{id:env.INSTAGRAM_APP_ID,secret:env.INSTAGRAM_APP_SECRET},
 youtube:{id:env.GOOGLE_CLIENT_ID,secret:env.GOOGLE_CLIENT_SECRET},
 tiktok:{id:env.TIKTOK_CLIENT_KEY,secret:env.TIKTOK_CLIENT_SECRET}
};
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function config(platform){
 if(!platformNames.includes(platform))fail('Unsupported platform.');
 if(!API_BASE.startsWith('https://')&&!API_BASE.startsWith('http://localhost:'))fail('Set PUBLIC_BASE_URL to the public HTTPS backend URL.',503);
 if(!encryptionKey)fail('Set a random 32-byte ROLLBLINK_TOKEN_ENCRYPTION_KEY (64 hex characters).',503);
 if(!clients[platform].id||!clients[platform].secret)fail('Developer OAuth credentials for '+platform+' are not configured.',503);
}
async function loadTokens(){
 if(savedTokens)return savedTokens;
 if(!encryptionKey)return {};
 try{
  const file=JSON.parse(await readFile(STORE_FILE,'utf8'));
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(file.iv,'base64'));
  decipher.setAuthTag(Buffer.from(file.tag,'base64'));
  savedTokens=JSON.parse(Buffer.concat([decipher.update(Buffer.from(file.data,'base64')),decipher.final()]).toString('utf8'));
  return savedTokens;
 }catch(e){if(e.code==='ENOENT'){savedTokens={};return savedTokens}throw Error('Could not unlock social token store. Check encryption key and volume.')}
}
async function saveTokens(tokens){
 if(!encryptionKey)fail('Token storage is not configured.',503);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
 const file=JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
 const dir=STORE_FILE.slice(0,STORE_FILE.lastIndexOf('/'))||'.';
 await mkdir(dir,{recursive:true});
 const temp=STORE_FILE+'.'+randomUUID();
 await writeFile(temp,file,{mode:0o600});await rename(temp,STORE_FILE);
 savedTokens=tokens;
}
function callbackUrl(platform){return API_BASE+'/api/social/callback/'+platform}
function jsonResponse(response,payload,status=200){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(payload))}
async function requestJson(url,{method='GET',token='',form=null,body=null,headers={}}={}){
 const resp=await fetch(url,{method,headers:{
   ...(token?{Authorization:'Bearer '+token}:{}),
   ...(form?{'Content-Type':'application/x-www-form-urlencoded'}:body?{'Content-Type':'application/json'}:{}),
   ...headers
  },...(form?{body:new URLSearchParams(form)}:body?{body:JSON.stringify(body)}:{})});
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||data.error?.code&&data.error.code!=='ok'){
  const err=data.error?.message||data.error_description||data.message||'Provider API request failed';
  fail(String(err).slice(0,250),resp.status>=400?resp.status:502);
 }
 return data;
}
function authUrl(platform,state){
 const redirect_uri=callbackUrl(platform);
 if(platform==='youtube'){
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({client_id:clients.youtube.id,redirect_uri,response_type:'code',scope:'https://www.googleapis.com/auth/youtube.upload',access_type:'offline',prompt:'consent',state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.href;
 }
 if(platform==='tiktok'){
  const u=new URL('https://www.tiktok.com/v2/auth/authorize/');
  Object.entries({client_key:clients.tiktok.id,redirect_uri,response_type:'code',scope:'user.info.basic,video.publish',state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.href;
 }
 const u=new URL('https://www.instagram.com/oauth/authorize');
 Object.entries({client_id:clients.instagram.id,redirect_uri,response_type:'code',scope:'instagram_business_basic,instagram_business_content_publish',state}).forEach(([k,v])=>u.searchParams.set(k,v));
 return u.href;
}
async function exchange(platform,code){
 if(platform==='youtube'){
  const d=await requestJson('https://oauth2.googleapis.com/token',{method:'POST',form:{client_id:clients.youtube.id,client_secret:clients.youtube.secret,code,grant_type:'authorization_code',redirect_uri:callbackUrl(platform)}});
  return {access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+(d.expires_in||3600)*1000,label:'YouTube'};
 }
 if(platform==='tiktok'){
  const d=await requestJson('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',form:{client_key:clients.tiktok.id,client_secret:clients.tiktok.secret,code,grant_type:'authorization_code',redirect_uri:callbackUrl(platform)}});
  if(!d.access_token||!d.refresh_token)fail('TikTok did not return required tokens.',502);
  let label='TikTok';
  try{const i=await requestJson('https://open.tiktokapis.com/v2/user/info/?fields=display_name',{token:d.access_token});label=i.data?.user?.display_name||label}catch{}
  return {access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+(d.expires_in||86400)*1000,label};
 }
 const d=await requestJson('https://api.instagram.com/oauth/access_token',{method:'POST',form:{client_id:clients.instagram.id,client_secret:clients.instagram.secret,grant_type:'authorization_code',redirect_uri:callbackUrl(platform),code}});
 const short=d.access_token||d.data?.[0]?.access_token,userId=d.user_id||d.data?.[0]?.user_id;
 if(!short||!userId)fail('Instagram did not return an authorized account.',502);
 const u=new URL('https://graph.instagram.com/access_token');
 Object.entries({grant_type:'ig_exchange_token',client_secret:clients.instagram.secret,access_token:short}).forEach(([k,v])=>u.searchParams.set(k,v));
 const long=await requestJson(u.href);
 let label='Instagram';
 try{const me=await requestJson(GRAPH+'/me?fields=id,username',{token:long.access_token});label=me.username||label}catch{}
 return {access_token:long.access_token,user_id:String(userId),expires_at:Date.now()+(long.expires_in||5184000)*1000,label};
}
async function validToken(platform){
 const tokens=await loadTokens(),current=tokens[platform];
 if(!current?.access_token)fail('Connect '+platform+' first.',409);
 if(current.expires_at>Date.now()+120000)return current;
 if(platform==='instagram')fail('Instagram connection expired. Reconnect to continue.',409);
 let d;
 if(platform==='youtube')d=await requestJson('https://oauth2.googleapis.com/token',{method:'POST',form:{client_id:clients.youtube.id,client_secret:clients.youtube.secret,refresh_token:current.refresh_token,grant_type:'refresh_token'}});
 else d=await requestJson('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',form:{client_key:clients.tiktok.id,client_secret:clients.tiktok.secret,refresh_token:current.refresh_token,grant_type:'refresh_token'}});
 const next={...current,access_token:d.access_token,refresh_token:d.refresh_token||current.refresh_token,expires_at:Date.now()+(d.expires_in||3600)*1000};
 await saveTokens({...tokens,[platform]:next});return next;
}
async function mediaFile(id){
 if(!/^[0-9a-f-]{36}$/.test(id))fail('Invalid video ID.');
 const path=join(MEDIA_DIR,id+'.mp4'),s=await stat(path).catch(()=>null);
 if(!s||s.size<32||Date.now()-s.mtimeMs>MEDIA_TTL)fail('Video not available. Upload again.',404);
 return {path,size:s.size};
}
/* Remove expired public video URLs and reclaim a bounded private beta disk. */
export async function cleanupExpiredMedia(){
 let removed=0;
 const now=Date.now();
 let names;
 try{names=await readdir(MEDIA_DIR)}catch(e){if(e.code==='ENOENT')return 0;throw e}
 for(const name of names){
  if(!/^[0-9a-f-]{36}\\.mp4$/.test(name))continue;
  const path=join(MEDIA_DIR,name);
  const info=await stat(path).catch(()=>null);
  if(info&&now-info.mtimeMs>MEDIA_TTL){await unlink(path).catch(()=>{});removed++}
 }
 return removed;
}

async function upload(req){
 if(String(req.headers['content-type']||'').split(';')[0]!=='video/mp4')fail('Only MP4 video uploads are supported.');
 if(!API_BASE.startsWith('https://')&&!API_BASE.startsWith('http://localhost:'))fail('PUBLIC_BASE_URL must be configured.',503);
 const rawLength=req.headers['content-length'];
 const length=rawLength===undefined?null:Number(rawLength);
 if(length!==null&&(!Number.isSafeInteger(length)||length<32||length>MAX_VIDEO))fail('MP4 must be 32 bytes to 200 MB.');
 await mkdir(MEDIA_DIR,{recursive:true});
 const id=randomUUID(),path=join(MEDIA_DIR,id+'.mp4');
 let count=0;
 try{
  await pipeline(req,new Transform({transform(chunk,_enc,cb){count+=chunk.length;cb(count>MAX_VIDEO||(length!==null&&count>length)?Error('Video exceeds maximum or declared size.'):null,chunk)}}),createWriteStream(path,{flags:'wx',mode:0o600}));
  if(count<32||(length!==null&&count!==length))fail('Video upload incomplete.');
  const handle=await open(path,'r'),header=Buffer.alloc(12);
  try{await handle.read(header,0,12,0)}finally{await handle.close()}
  if(header.toString('ascii',4,8)!=='ftyp')fail('Invalid MP4 file. Export an MP4, not WebM.');
  return {mediaId:id,videoUrl:API_BASE+'/media/'+id+'.mp4',bytes:count};
 }catch(e){await unlink(path).catch(()=>{});throw e}
}
async function video(platform,input){
 const id=String(input.mediaId||'');const file=await mediaFile(id);
 return {...file,url:API_BASE+'/media/'+id+'.mp4'};
}
async function publishYouTube(input){
 const account=await validToken('youtube'),file=await video('youtube',input);
 const title=String(input.title||'').trim().slice(0,100),description=String(input.caption||'').slice(0,5000);
 const privacy=['private','unlisted','public'].includes(input.privacy)?input.privacy:'private';
 if(!title)fail('Enter a YouTube title.');
 const start=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',
  headers:{Authorization:'Bearer '+account.access_token,'Content-Type':'application/json; charset=utf-8','X-Upload-Content-Length':String(file.size),'X-Upload-Content-Type':'video/mp4'},
  body:JSON.stringify({snippet:{title,description,categoryId:'22'},status:{privacyStatus:privacy,selfDeclaredMadeForKids:false}})});
 if(!start.ok)fail('YouTube rejected upload initialization ('+start.status+').',502);
 const location=start.headers.get('location');if(!location||!location.startsWith('https://www.googleapis.com/'))fail('YouTube did not provide a valid upload location.',502);
 const result=await fetch(location,{method:'PUT',headers:{'Content-Type':'video/mp4','Content-Length':String(file.size)},body:createReadStream(file.path),duplex:'half'});
 const d=await result.json().catch(()=>({}));
 if(!result.ok||!d.id)fail('YouTube upload was not completed ('+result.status+').',502);
 return {status:'uploaded',platform:'youtube',videoId:d.id,url:'https://www.youtube.com/watch?v='+encodeURIComponent(d.id),message:'Uploaded. YouTube may still be processing the video.'};
}
async function instagramFinish(account,tokens){
 const id=account.pending_container;
 if(!id)fail('No Instagram Reel is awaiting completion.',409);
 const status=await requestJson(GRAPH+'/'+encodeURIComponent(id)+'?fields=status_code',{token:account.access_token});
 if(status.status_code==='ERROR'||status.status_code==='EXPIRED')fail('Instagram processing failed: '+status.status_code,502);
 if(status.status_code!=='FINISHED')return {platform:'instagram',status:'processing',message:'Instagram is still processing. Tap Complete Reel again shortly.'};
 const result=await requestJson(GRAPH+'/'+encodeURIComponent(account.user_id)+'/media_publish',{method:'POST',token:account.access_token,form:{creation_id:id}});
 const next={...account,pending_container:null};
 await saveTokens({...tokens,instagram:next});
 return {platform:'instagram',status:'published',postId:result.id,message:'Instagram accepted the Reel for publication.'};
}
async function publishInstagram(input){
 const tokens=await loadTokens(),account=await validToken('instagram'),file=await video('instagram',input);
 if(account.pending_container)return instagramFinish(account,await loadTokens());
 const caption=String(input.caption||'').slice(0,2200);
 const result=await requestJson(GRAPH+'/'+encodeURIComponent(account.user_id)+'/media',{method:'POST',token:account.access_token,form:{media_type:'REELS',video_url:file.url,caption,share_to_feed:'true'}});
 if(!result.id)fail('Instagram did not create a Reel container.',502);
 await saveTokens({...await loadTokens(),instagram:{...account,pending_container:String(result.id)}});
 return {platform:'instagram',status:'processing',message:'Reel uploaded for Instagram processing. Tap Complete Reel after it finishes.'};
}
async function tiktokCreator(){
 const a=await validToken('tiktok');
 const d=await requestJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',token:a.access_token,body:{}});
 return {privacyOptions:d.data?.privacy_level_options||[],maxDuration:d.data?.max_video_post_duration_sec||null,label:d.data?.creator_nickname||a.label};
}
async function publishTikTok(input){
 const a=await validToken('tiktok'),file=await video('tiktok',input);
 const creator=await tiktokCreator();
 if(!creator.privacyOptions.includes(input.privacy))fail('Choose an allowed TikTok audience from the current creator settings.');
 // FILE_UPLOAD avoids requiring URL ownership verification, and does not expose the video publicly.
 const chunkSize=file.size<10000000?file.size:10000000;
 const totalChunks=Math.floor(file.size/chunkSize);
 const d=await requestJson('https://open.tiktokapis.com/v2/post/publish/video/init/',{method:'POST',token:a.access_token,body:{
  post_info:{title:String(input.caption||'').slice(0,2200),privacy_level:input.privacy,
   disable_comment:Boolean(input.disableComments),disable_duet:Boolean(input.disableDuet),disable_stitch:Boolean(input.disableStitch),
   brand_organic_toggle:Boolean(input.ownBrand),is_aigc:Boolean(input.aiGenerated)},
  source_info:{source:'FILE_UPLOAD',video_size:file.size,chunk_size:chunkSize,total_chunk_count:totalChunks}
 }});
 if(!d.data?.publish_id||!d.data?.upload_url)fail('TikTok did not return an upload session.',502);
 const endpoint=new URL(d.data.upload_url);
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.tiktokapis.com'))fail('TikTok returned an unsafe upload URL.',502);
 for(let i=0;i<totalChunks;i++){
  const start=i*chunkSize,end=i===totalChunks-1?file.size-1:(i+1)*chunkSize-1;
  const size=end-start+1;
  const resp=await fetch(endpoint.href,{method:'PUT',headers:{
   'Content-Type':'video/mp4','Content-Length':String(size),
   'Content-Range':'bytes '+start+'-'+end+'/'+file.size
  },body:createReadStream(file.path,{start,end}),duplex:'half'});
  if(![201,206].includes(resp.status))fail('TikTok video transfer failed on chunk '+(i+1)+' ('+resp.status+').',502);
 }
 return {platform:'tiktok',status:'submitted',publishId:d.data.publish_id,message:'TikTok received the MP4. Use Check TikTok status to confirm publishing.'};
}
async function tiktokStatus(input){
 const a=await validToken('tiktok');
 const id=String(input.publishId||'');
 if(!/^[\w~.-]{5,150}$/.test(id))fail('Invalid TikTok publish ID.');
 const d=await requestJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',token:a.access_token,body:{publish_id:id}});
 return {platform:'tiktok',status:d.data?.status||'UNKNOWN',failReason:d.data?.fail_reason||null,publicPostIds:d.data?.publicaly_available_post_id||[]};
}
export function socialEnabled(){return Boolean(API_BASE&&encryptionKey)}
export async function handleSocial(req,res,{authorized,readBody,respond,origin}){
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path.startsWith('/media/')&&req.method==='GET'){
  try{const id=path.split('/').pop().replace(/\.mp4$/,'');const f=await mediaFile(id);
   res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':f.size,'Cache-Control':'public,max-age=300','Accept-Ranges':'none','X-Content-Type-Options':'nosniff'});
   createReadStream(f.path).pipe(res);
  }catch{respond(res,404,{error:'Video not found'},origin)}return true;
 }
 if(!path.startsWith('/api/social/')&&!path.startsWith('/api/media'))return false;
 try{
  if(path.startsWith('/api/social/callback/')&&req.method==='GET'){
   const platform=path.split('/').pop(),state=url.searchParams.get('state')||'',pending=pendingStates.get(state);
   if(!pending||pending.platform!==platform||pending.expires<Date.now())fail('OAuth session expired or invalid.',403);
   pendingStates.delete(state);
   if(url.searchParams.has('error'))fail('Authorization was cancelled or denied.');
   const code=url.searchParams.get('code');if(!code)fail('Authorization code missing.');
   const account=await exchange(platform,code),tokens=await loadTokens();
   await saveTokens({...tokens,[platform]:account});
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"});
   res.end('<!doctype html><meta charset="utf-8"><title>Connected to Rollblink</title><body style="background:#101116;color:white;font:20px system-ui;text-align:center;padding:3rem">Account connected. You can close this window.<script>if(window.opener){window.opener.postMessage({type:"rollblink-social-oauth",ok:true},'+JSON.stringify(ORIGIN)+');window.close()}</script></body>');
   return true;
  }
  if(!authorized(req))fail('Unauthorized. Enter your beta access token.',401);
  if(req.method==='GET'&&path==='/api/social/status'){
   const t=await loadTokens(),statuses={};
   for(const p of platformNames)statuses[p]={connected:Boolean(t[p]?.access_token),label:t[p]?.label||'',configured:Boolean(clients[p].id&&clients[p].secret),pending:Boolean(t[p]?.pending_container)};
   respond(res,200,{platforms:statuses,backendConfigured:socialEnabled(),videoLimitMB:200},origin);return true;
  }
  if(req.method==='POST'&&path==='/api/social/connect'){
   const {platform}=await readBody(req);config(platform);
   for(const [k,v] of pendingStates)if(v.expires<Date.now())pendingStates.delete(k);
   const state=randomBytes(24).toString('hex');
   pendingStates.set(state,{platform,expires:Date.now()+10*60*1000});
   respond(res,200,{url:authUrl(platform,state)},origin);return true;
  }
  if(req.method==='POST'&&path==='/api/social/disconnect'){
   const {platform}=await readBody(req);
   if(!platformNames.includes(platform))fail('Unsupported platform.');
   const t=await loadTokens();delete t[platform];await saveTokens(t);
   respond(res,200,{disconnected:platform},origin);return true;
  }
  if(req.method==='PUT'&&path==='/api/media'){
   const result=await upload(req);respond(res,201,result,origin);return true;
  }
  if(req.method==='GET'&&path==='/api/social/tiktok/creator'){
   respond(res,200,await tiktokCreator(),origin);return true;
  }
  if(req.method==='POST'&&path==='/api/social/publish'){
   const input=await readBody(req);
   if(!['instagram','youtube','tiktok'].includes(input.platform))fail('Choose a supported destination.');
   const outcome=await ({instagram:publishInstagram,youtube:publishYouTube,tiktok:publishTikTok})[input.platform](input);
   respond(res,200,outcome,origin);return true;
  }
  if(req.method==='POST'&&path==='/api/social/instagram/complete'){
   const t=await loadTokens(),a=await validToken('instagram');
   respond(res,200,await instagramFinish(a,t),origin);return true;
  }
  if(req.method==='POST'&&path==='/api/social/tiktok/status'){
   respond(res,200,await tiktokStatus(await readBody(req)),origin);return true;
  }
  respond(res,404,{error:'Social route not found.'},origin);return true;
 }catch(e){
  const safeStatus=Number.isInteger(e.status)&&e.status>=400&&e.status<600?e.status:500;
  respond(res,safeStatus,{error:safeStatus===500?'Social integration failed. Check backend logs.':String(e.message)},origin);return true;
 }
}
