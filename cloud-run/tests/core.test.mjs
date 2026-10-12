import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHandler,validateRegistration} from '../src/core.mjs';
import {validateCloudProject} from '../src/projectCore.mjs';
const user='test_user-42';
const path='users/'+user+'/media/0123456789ABCDEF/example.mp4';
const allow=['https://vidnivo-demo.web.app'];
function fakeDeps(overrides={}){
 const existing=new Map();
 return {
  allowedOrigins:allow,
  verifyToken:async token=>{if(token!=='valid-token')throw Error('Invalid');return {uid:user};},
  getProfile:async id=>id===user?{displayName:'Creator'}:null,
  saveProfile:async()=>{},
  listMedia:async(id,after=null,limit=50)=>{
   const items=[...existing.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId))
    .filter(x=>!after||x.assetId>after);
   return {media:items.slice(0,limit),
    nextCursor:items.length>limit?items[limit-1].assetId:null};
  },
  getMedia:async(id,assetId)=>existing.get(assetId)||null,
  checkObject:async()=>({size:1024,contentType:'video/mp4'}),
  registerMedia:async(id,media)=>{existing.set(media.assetId,media);},
  listProjects:async()=>[],
  getProject:async()=>null,
  saveProject:async()=>1,
  uploadMedia:async()=>({size:1024}),
  downloadMedia:async()=>{},
   resolveSupport:async()=>({answer:'Retry a save safely.',action:'retry-save',category:'storage',aiGenerated:true,available:true}),
  deleteObject:async()=>{},
  deleteMedia:async(id,assetId)=>{existing.delete(assetId);},
  ...overrides
 };
}
async function fixture(t,deps){
 const server=createServer(createHandler(deps));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(done=>server.close(done)));
 return 'http://127.0.0.1:'+server.address().port;
}
const headers={Authorization:'Bearer valid-token','Content-Type':'application/json'};
test('health is public but private routes require Firebase Auth',async t=>{
 const base=await fixture(t,fakeDeps());
 const health=await fetch(base+'/api/healthz');assert.equal(health.status,200);
 assert.equal((await health.json()).status,'ok');
 const unauth=await fetch(base+'/api/v1/media');
 assert.equal(unauth.status,401);
 const forbidden=await fetch(base+'/api/v1/media',{headers:{Authorization:'Bearer wrong'}});
 assert.equal(forbidden.status,401);
 const valid=await fetch(base+'/api/v1/me',{headers});
 assert.equal(valid.status,200);
 assert.equal((await valid.json()).uid,user);
});
test('legacy unmetered media registration is disabled',async t=>{
 const base=await fixture(t,fakeDeps());
 const response=await fetch(base+'/api/v1/media/register',{method:'POST',headers,
  body:JSON.stringify({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'})});
 assert.equal(response.status,410);
 const list=await fetch(base+'/api/v1/media',{headers});
 assert.equal((await list.json()).media.length,0);
});
test('refuses attempts to register private media outside owner folders',()=>{
 for(const invalid of ['users/other/media/0123456789ABCDEF/clip.mp4',
  'users/test_user-42/media/0123456789ABCDEF/../clip.mp4',
  'users/test_user-42/media/DIFFERENT/clip.mp4']){
  assert.throws(()=>validateRegistration(user,{
   assetId:'0123456789ABCDEF',objectPath:invalid,name:'clip.mp4'
  }));
 }
});
test('CORS protects browser origins and JSON payload size is bounded',async t=>{
 const base=await fixture(t,fakeDeps());
 const no=await fetch(base+'/api/healthz',{headers:{Origin:'https://evil.example'}});
 assert.equal(no.status,403);
 const yes=await fetch(base+'/api/healthz',{headers:{Origin:allow[0]}});
 assert.equal(yes.status,200);
 assert.equal(yes.headers.get('access-control-allow-origin'),allow[0]);
 const options=await fetch(base+'/api/v1/media',{method:'OPTIONS',headers:{Origin:allow[0]}});
 assert.equal(options.status,204);
 const huge=await fetch(base+'/api/v1/me',{method:'PUT',headers,
  body:JSON.stringify({displayName:'A'.repeat(600000)})});
 assert.equal(huge.status,413);
});
test('oversized or misconfigured streamed media uploads fail closed',async t=>{
 const base=await fixture(t,fakeDeps());
 const tooLarge=await fetch(base+'/api/v1/media/0123456789ABCDEF/upload',{
  method:'PUT',headers:{Authorization:'Bearer valid-token','Content-Type':'video/mp4',
   'X-VIDNIVO-FILENAME':'example.mp4','X-VIDNIVO-SIZE':String(201*1024*1024)},
  body:Buffer.alloc(1)});
 assert.equal(tooLarge.status,400);
 const noBucket=await fixture(t,fakeDeps({storageReady:false}));
 const refused=await fetch(noBucket+'/api/v1/media/0123456789ABCDEF/upload',{
  method:'PUT',headers:{Authorization:'Bearer valid-token','Content-Type':'video/mp4',
   'X-VIDNIVO-FILENAME':'example.mp4','X-VIDNIVO-SIZE':'4'},
  body:'abcd'});
 assert.equal(refused.status,503);
});
test('signed-in owner can remove a registered file; deletion is retry-safe for missing cloud bytes',async t=>{
 const dependencies=fakeDeps();
 let deletedPath='';
 dependencies.deleteObject=async objectPath=>{deletedPath=objectPath;};
 const base=await fixture(t,dependencies);
 await dependencies.registerMedia(user,{assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4',size:1024});
 const before=await fetch(base+'/api/v1/media',{headers});
 assert.equal((await before.json()).media[0].objectPath,path);
 const rejected=await fetch(base+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',
  headers:{Authorization:'Bearer wrong'}});
 assert.equal(rejected.status,401);
 const removed=await fetch(base+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',headers});
 assert.equal(removed.status,200);
 assert.deepEqual(await removed.json(),{assetId:'0123456789ABCDEF',deleted:true});
 assert.equal(deletedPath,path);
 const after=await fetch(base+'/api/v1/media',{headers});
 assert.equal((await after.json()).media.length,0);
 const notFound=await fetch(base+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',headers});
 assert.equal(notFound.status,404);
});
test('deletion never crosses user boundaries or removes a file for a malformed registry record',async t=>{
 let removed=0;
 const base=await fixture(t,fakeDeps({
  getMedia:async()=>({objectPath:'users/another_user/media/0123456789ABCDEF/example.mp4',
   name:'example.mp4'}),
  deleteObject:async()=>{removed++;}
 }));
 const response=await fetch(base+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',headers});
 assert.equal(response.status,403);
 assert.equal(removed,0);
 const invalid=await fetch(base+'/api/v1/media/not-valid!id',{method:'DELETE',headers});
 assert.equal(invalid.status,404);
});
test('storage removal failures retain metadata for safe retries',async t=>{
 const deps=fakeDeps({deleteObject:async()=>{throw Error('Storage failure: private');}});
 const base=await fixture(t,deps);
 await deps.registerMedia(user,{assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4',size:1024});
 const failed=await fetch(base+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',headers});
 assert.equal(failed.status,500);
 assert.doesNotMatch((await failed.json()).error,/Storage failure: private/);
 const after=await fetch(base+'/api/v1/media',{headers});
 assert.equal((await after.json()).media.length,1);
 const offline=await fixture(t,fakeDeps({storageReady:false}));
 const refused=await fetch(offline+'/api/v1/media/0123456789ABCDEF',{method:'DELETE',headers});
 assert.equal(refused.status,503);
 const preflight=await fetch(base+'/api/v1/media/0123456789ABCDEF',{
  method:'OPTIONS',headers:{Origin:allow[0]}});
 assert.match(preflight.headers.get('access-control-allow-methods'),/DELETE/);
});

test('media list uses stable paginated cursors and rejects malformed cursors',async t=>{
 const original=fakeDeps();
 const ids=['11111111','22222222','33333333'];
 for(const assetId of ids){
  await original.registerMedia(user,{assetId,name:assetId+'.mp4',
   objectPath:'users/'+user+'/media/'+assetId+'/sample.mp4',size:8});
 }
 const base=await fixture(t,original);
 const first=await fetch(base+'/api/v1/media',{headers});
 assert.equal(first.status,200);
 assert.deepEqual((await first.json()).media.map(item=>item.assetId),ids);
 const second=await fetch(base+'/api/v1/media?after=11111111',{headers});
 assert.deepEqual((await second.json()).media.map(item=>item.assetId),ids.slice(1));
 const invalid=await fetch(base+'/api/v1/media?after=%2E%2E',{headers});
 assert.equal(invalid.status,400);
});

test('a library larger than 50 files is retrievable without duplicates',async t=>{
 const deps=fakeDeps();
 for(let n=0;n<53;n++){
  const assetId='clip'+String(n).padStart(8,'0');
  await deps.registerMedia(user,{assetId,name:assetId+'.mp4',
   objectPath:'users/'+user+'/media/'+assetId+'/sample.mp4',size:8});
 }
 const base=await fixture(t,deps);
 const first=await fetch(base+'/api/v1/media',{headers});
 const firstPage=await first.json();
 assert.equal(firstPage.media.length,50);
 assert.match(firstPage.nextCursor,/^clip\d{8}$/);
 const second=await fetch(base+'/api/v1/media?after='+firstPage.nextCursor,{headers});
 const secondPage=await second.json();
 assert.equal(secondPage.media.length,3);
 assert.equal(secondPage.nextCursor,null);
 const ids=[...firstPage.media,...secondPage.media].map(item=>item.assetId);
 assert.equal(new Set(ids).size,53);
});

const portable={
 id:'project_001',name:'My edit',aspectRatio:'9:16',
 createdAt:'2026-10-12T13:00:00.000Z',updatedAt:'2026-10-12T14:00:00.000Z',revision:3,
 assets:[{id:'0123456789ABCDEF',kind:'video',uri:'cloud://0123456789ABCDEF',
  filename:'example.mp4',durationMs:10000,width:720,height:1280}],
 clips:[{id:'clip_0001',assetId:'0123456789ABCDEF',track:'video',startMs:0,
  inMs:0,outMs:10000,speed:1,volume:1,muted:false}],texts:[]
};
test('only cloud:// media refs can be stored as portable project edits',()=>{
 assert.equal(validateCloudProject(portable,'project_001').assets[0].uri,'cloud://0123456789ABCDEF');
 assert.throws(()=>validateCloudProject({...portable,assets:[
  {...portable.assets[0],uri:'file:///private/phone/video.mp4'}]},'project_001'));
 assert.throws(()=>validateCloudProject(portable,'another_project'));
 assert.throws(()=>validateCloudProject({...portable,clips:[
  {...portable.clips[0],assetId:'missing_000'}]},'project_001'));
});
test('authorized cloud backup requires registered media and conditional version',async t=>{
 let saved=0,version=0;
 const deps=fakeDeps({
  saveProject:async(uid,id,p,baseVersion)=>{
   assert.equal(uid,user);
   assert.equal(id,p.id);
   if(baseVersion!==version)throw Object.assign(Error('Version conflict'),{status:409});
   saved++;return ++version;
  },
  getProject:async()=>version?{project:portable,version}:null,
  listProjects:async()=>version?[{id:portable.id,name:portable.name,version}]:[]
 });
 const base=await fixture(t,deps);
 const put=body=>fetch(base+'/api/v1/projects/project_001',{
  method:'PUT',headers,body:JSON.stringify(body)});
 let resp=await put({baseVersion:0,project:portable});
 assert.equal(resp.status,409);
 await deps.registerMedia(user,{assetId:'0123456789ABCDEF',objectPath:path,
  name:'example.mp4'});
 resp=await put({baseVersion:0,project:portable});
 assert.equal(resp.status,200);
 assert.equal((await resp.json()).version,1);
 resp=await put({baseVersion:0,project:portable});
 assert.equal(resp.status,409);
 assert.equal(saved,1);
 const found=await fetch(base+'/api/v1/projects/project_001',{headers});
 assert.equal((await found.json()).project.id,'project_001');
 const listed=await fetch(base+'/api/v1/projects',{headers});
 assert.equal((await listed.json()).projects.length,1);
});
test('mobile file transfer routes reject unauthorized users and bad uploads',async t=>{
 let streamed=0;
 const deps=fakeDeps({
  uploadMedia:async()=>{streamed++;return {size:4};},
  downloadMedia:async(media,res)=>{
   res.statusCode=200;res.end('okay');
  }
 });
 await deps.registerMedia(user,{assetId:'0123456789ABCDEF',objectPath:path,
  name:'example.mp4',size:4,contentType:'video/mp4'});
 const base=await fixture(t,deps);
 const unauthorized=await fetch(base+'/api/v1/media/0123456789ABCDEF/download');
 assert.equal(unauthorized.status,401);
 const okay=await fetch(base+'/api/v1/media/0123456789ABCDEF/download',{headers});
 assert.equal(await okay.text(),'okay');
 const bad=await fetch(base+'/api/v1/media/unused_009/upload',{
  method:'PUT',headers:{...headers,'Content-Type':'video/mp4','X-VIDNIVO-FILENAME':'../../bad.mp4'},
  body:'abcd'});
 assert.equal(bad.status,400);
 assert.equal(streamed,0);
 const collision=await fetch(base+'/api/v1/media/0123456789ABCDEF/upload',{
  method:'PUT',headers:{...headers,'Content-Type':'video/mp4','X-VIDNIVO-FILENAME':'another.mp4'},
  body:'abcd'});
 assert.equal(collision.status,409);
});

test('AI support is private, validates diagnostics and never executes device code',async t=>{
 let calls=0;
 const base=await fixture(t,fakeDeps({resolveSupport:async(uid,request)=>{
  assert.equal(uid,user);calls++;
  assert.equal(request.diagnostics.cloudToken,undefined);
  return {answer:'Check the preview.',action:'restart-preview',category:'playback',aiGenerated:true,available:true};
 }}));
 let answer=await fetch(base+'/api/v1/support/diagnose',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({issue:'Preview is frozen',diagnostics:{platform:'ios',screen:'editor'}})
 });
 assert.equal(answer.status,401);
 answer=await fetch(base+'/api/v1/support/diagnose',{method:'POST',headers,
  body:JSON.stringify({issue:'Preview is frozen',diagnostics:{
   platform:'ios',screen:'editor',cloudToken:'do-not-forward'}})});
 assert.equal(answer.status,200);
 const json=await answer.json();
 assert.equal(json.action,'restart-preview');
 assert.equal(json.autoApplied,false);
 assert.equal(calls,1);
 const invalid=await fetch(base+'/api/v1/support/diagnose',{method:'POST',headers,
  body:JSON.stringify({issue:'hi',diagnostics:{screen:'editor'}})});
 assert.equal(invalid.status,400);
 assert.equal(calls,1);
});
