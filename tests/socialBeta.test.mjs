import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.PORT='0';
process.env.ALLOWED_ORIGINS='http://localhost:4173';
process.env.ROLLBLINK_ACCESS_TOKEN='test_beta_secret_123456789012345678901234567890';
delete process.env.OPENAI_API_KEY;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.INSTAGRAM_APP_ID;
delete process.env.TIKTOK_CLIENT_KEY;
let server,base;
before(async()=>{
 ({server}=await import('../server/index.mjs'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server?.listening)await new Promise(resolve=>server.close(resolve))});
const auth={Authorization:'Bearer '+process.env.ROLLBLINK_ACCESS_TOKEN,Origin:'http://localhost:4173'};

test('health route reports AI configuration and no credentials',async()=>{
 const response=await fetch(base+'/health',{headers:{Origin:'http://localhost:4173'}});
 assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.aiConfigured,false);
});
test('social account status never exposes credentials',async()=>{
 const response=await fetch(base+'/api/social/status',{headers:auth});
 assert.equal(response.status,200);
 const body=await response.json();
 for(const p of ['instagram','youtube','tiktok'])assert.equal(body.platforms[p].connected,false);
 assert.equal(JSON.stringify(body).includes(process.env.ROLLBLINK_ACCESS_TOKEN),false);
});
test('unauthenticated callers cannot read social account status',async()=>{
 const response=await fetch(base+'/api/social/status');
 assert.equal(response.status,401);
});
test('unauthenticated callers cannot upload media',async()=>{
 const response=await fetch(base+'/api/media',{method:'PUT',body:'not-mp4',headers:{'Content-Type':'video/mp4'}});
 assert.equal(response.status,401);
});
test('browser CORS preflight allows secure video transfer',async()=>{
 const response=await fetch(base+'/api/media',{method:'OPTIONS',headers:{Origin:'http://localhost:4173','Access-Control-Request-Method':'PUT'}});
 assert.equal(response.status,204);
 assert.match(response.headers.get('access-control-allow-methods')||'',/PUT/);
});
test('disallowed browser origins cannot access social routes',async()=>{
 const response=await fetch(base+'/api/social/status',{headers:{...auth,Origin:'https://evil.example'}});
 assert.equal(response.status,403);
});
test('OAuth cannot start without configured platform credentials',async()=>{
 const response=await fetch(base+'/api/social/connect',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({platform:'instagram'})});
 assert.equal(response.status,503);
});
test('reject non MP4 uploads even with authorization',async()=>{
 const response=await fetch(base+'/api/media',{method:'PUT',headers:{...auth,'Content-Type':'video/webm'},body:Buffer.alloc(120)});
 assert.equal(response.status,400);
});
test('random media URL is not served publicly',async()=>{
 const response=await fetch(base+'/media/12345678-1234-1234-1234-123456789012.mp4');
 assert.equal(response.status,404);
});
test('no beta access token allows OpenAI generation',async()=>{
 const response=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:'Instagram',transcript:'test'})});
 assert.equal(response.status,401);
});
