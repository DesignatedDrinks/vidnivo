import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.OPENAI_API_KEY='fake-test-value';
process.env.ROLLBLINK_ACCESS_TOKEN='a-long-private-beta-token-for-tests';
process.env.ALLOWED_ORIGINS='https://designateddrinks.github.io';

const {server}=await import('../server/index.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>server.close(resolve)));

test('health checks configuration without revealing secrets',async()=>{
 const res=await fetch(base+'/health');
 assert.equal(res.status,200);
 const payload=await res.json();
 assert.equal(payload.aiConfigured,true);
 assert.equal(JSON.stringify(payload).includes('fake-test-value'),false);
});
test('anonymous access is blocked',async()=>{
 const res=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({transcript:'A sample transcript',platform:'Instagram'})});
 assert.equal(res.status,401);
});
test('cross-origin requests are blocked',async()=>{
 const res=await fetch(base+'/api/generate',{method:'OPTIONS',headers:{Origin:'https://evil.example'}});
 assert.equal(res.status,403);
});
test('allowed origin gets a preflight with only required headers',async()=>{
 const res=await fetch(base+'/api/generate',{method:'OPTIONS',headers:{Origin:'https://designateddrinks.github.io'}});
 assert.equal(res.status,204);
 assert.equal(res.headers.get('access-control-allow-origin'),'https://designateddrinks.github.io');
});
test('invalid transcript rejected without calling provider',async()=>{
 const res=await fetch(base+'/api/generate',{method:'POST',headers:{
  Authorization:'Bearer a-long-private-beta-token-for-tests','Content-Type':'application/json'},
  body:JSON.stringify({transcript:'',platform:'TikTok'})});
 assert.equal(res.status,400);
});
