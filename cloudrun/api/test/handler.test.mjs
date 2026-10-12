import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApiHandler} from '../src/handler.mjs';

const TOKEN='123456789012345678901234567890';
const HEADERS={Authorization:'Bearer '+TOKEN};
async function useServer(t,overrides={}){
 const users=new Map();
 const calls=[];
 const handler=createApiHandler({
  verifyIdToken:async(token)=>{if(token!==TOKEN)throw Error('Bad token');return{uid:'alice-001'};},
  readProfile:async uid=>users.get(uid)||null,
  updateProfile:async(uid,body)=>{calls.push({uid,body});users.set(uid,body);},
  now:()=> '2026-10-12T00:00:00.000Z',
  allowedOrigins:['https://vidnivo.example'],...overrides
 });
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 return {users,calls,base,request:(path,options={})=>fetch(base+path,options)};
}
test('health endpoint is public but never exposes cloud environment',async t=>{
 const {request}=await useServer(t);
 const res=await request('/healthz');
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true,service:'vidnivo-api',version:1});
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('all user account endpoints require a verified Firebase ID token',async t=>{
 const {request}=await useServer(t);
 assert.equal((await request('/v1/me')).status,401);
 assert.equal((await request('/v1/me',{headers:{Authorization:'Bearer '+('x'.repeat(30))}})).status,401);
 assert.equal((await request('/v1/me',{headers:HEADERS})).status,200);
});
test('a user can read and update only their own account profile',async t=>{
 const {request,users,calls}=await useServer(t);
 const put=await request('/v1/me',{method:'PUT',headers:{...HEADERS,'Content-Type':'application/json'},
   body:JSON.stringify({displayName:' Creative person '})});
 assert.equal(put.status,200);
 assert.equal((await put.json()).profile.displayName,'Creative person');
 assert.deepEqual(calls.map(c=>c.uid),['alice-001']);
 assert.equal(users.size,1);
 const read=await request('/v1/me',{headers:HEADERS});
 assert.equal((await read.json()).profile.displayName,'Creative person');
});
test('rejects UID injection, excessive content and malformed data',async t=>{
 const {request,calls}=await useServer(t);
 const put=(body,headers={})=>request('/v1/me',{method:'PUT',
  headers:{...HEADERS,'Content-Type':'application/json',...headers},body});
 assert.equal((await put(JSON.stringify({uid:'victim',displayName:'Hacker'}))).status,400);
 assert.equal((await put(JSON.stringify({displayName:'\u0000'}))).status,400);
 assert.equal((await put(JSON.stringify({displayName:'x'.repeat(10000)}))).status,413);
 assert.equal((await put('not JSON')).status,400);
 assert.equal((await put(JSON.stringify({displayName:'Hacker'}),{'Content-Type':'text/plain'})).status,415);
 assert.equal(calls.length,0);
});
test('browser CORS is allowlisted; native clients need no Origin header',async t=>{
 const {request}=await useServer(t);
 const good=await request('/v1/me',{headers:{...HEADERS,Origin:'https://vidnivo.example'}});
 assert.equal(good.status,200);
 assert.equal(good.headers.get('access-control-allow-origin'),'https://vidnivo.example');
 const bad=await request('/v1/me',{headers:{...HEADERS,Origin:'https://evil.example'}});
 assert.equal(bad.status,403);
 assert.equal(bad.headers.get('access-control-allow-origin'),null);
 const preflight=await request('/v1/me',{method:'OPTIONS',
  headers:{Origin:'https://vidnivo.example','Access-Control-Request-Method':'PUT'}});
 assert.equal(preflight.status,204);
});
test('database outages are generic to users and do not leak server internals',async t=>{
 const {request}=await useServer(t,{readProfile:async()=>{throw Error('SECRET_DATA_ACCESS_FAILURE');}});
 const res=await request('/v1/me',{headers:HEADERS});
 assert.equal(res.status,503);
 const data=await res.json();
 assert.ok(!JSON.stringify(data).includes('SECRET_DATA_ACCESS_FAILURE'));
});
