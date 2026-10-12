import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHandler,validateRegistration} from '../src/core.mjs';
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
  listMedia:async()=>[...existing.values()],
  getMedia:async(id,assetId)=>existing.get(assetId)||null,
  checkObject:async()=>({size:1024,contentType:'video/mp4'}),
  registerMedia:async(id,media)=>{existing.set(media.assetId,media);},
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
test('media registration checks owner path, object and prevents asset ID collisions',async t=>{
 const base=await fixture(t,fakeDeps());
 const post=async body=>fetch(base+'/api/v1/media/register',{
  method:'POST',headers,body:JSON.stringify(body)
 });
 let reply=await post({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'});
 assert.equal(reply.status,200);
 const list=await fetch(base+'/api/v1/media',{headers});
 assert.equal((await list.json()).media.length,1);
 reply=await post({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'});
 assert.equal(reply.status,200);
 reply=await post({assetId:'0123456789ABCDEF',
  objectPath:'users/'+user+'/media/0123456789ABCDEF/other.mp4',name:'other.mp4'});
 assert.equal(reply.status,409);
 reply=await post({assetId:'0123456789ABCDEF',
  objectPath:'users/other_user/media/0123456789ABCDEF/example.mp4',name:'example.mp4'});
 assert.equal(reply.status,403);
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
  body:JSON.stringify({displayName:'A'.repeat(30000)})});
 assert.equal(huge.status,413);
});
test('invalid uploads are rejected without exposing backend details',async t=>{
 const base=await fixture(t,fakeDeps({
  checkObject:async()=>({size:500*1024*1024,contentType:'video/mp4'})
 }));
 const req=await fetch(base+'/api/v1/media/register',{method:'POST',headers,
  body:JSON.stringify({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'})});
 assert.equal(req.status,400);
 const noBucket=await fixture(t,fakeDeps({storageReady:false}));
 const r=await fetch(noBucket+'/api/v1/media/register',{method:'POST',headers,
  body:JSON.stringify({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'})});
 assert.equal(r.status,503);
});

test('signed-in owner can remove a registered file; deletion is retry-safe for missing cloud bytes',async t=>{
 const dependencies=fakeDeps();
 let deletedPath='';
 dependencies.deleteObject=async objectPath=>{deletedPath=objectPath;};
 const base=await fixture(t,dependencies);
 const created=await fetch(base+'/api/v1/media/register',{method:'POST',headers,
  body:JSON.stringify({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'})});
 assert.equal(created.status,200);
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
 await fetch(base+'/api/v1/media/register',{method:'POST',headers,
  body:JSON.stringify({assetId:'0123456789ABCDEF',objectPath:path,name:'example.mp4'})});
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
