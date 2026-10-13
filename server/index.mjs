/* Rollblink private-beta AI backend. Node 22+. No third-party dependencies.
   Keep OPENAI_API_KEY and ROLLBLINK_ACCESS_TOKEN in server environment secrets.
   For multi-user commercial launch, replace shared bearer token with real identity auth. */
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {handleSocial} from './social.mjs';
import {requestCreatorKit} from './creator.mjs';

const PORT=Number(process.env.PORT||8080);
const MODEL=process.env.OPENAI_MODEL||'gpt-5.4-mini';
const OPENAI_KEY=process.env.OPENAI_API_KEY||'';
const ACCESS_TOKEN=process.env.ROLLBLINK_ACCESS_TOKEN||'';
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'https://designateddrinks.github.io')
 .split(',').map(v=>v.trim()).filter(Boolean);
const allowedPlatforms=new Set(['Instagram','TikTok','YouTube Shorts','LinkedIn']);
const attempts=new Map();
const MAX_PER_MINUTE=12;

function respond(res,status,payload,origin=''){
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.end(JSON.stringify(payload));
}
function authorized(req){
 if(!ACCESS_TOKEN||ACCESS_TOKEN.length<24)return false;
 const supplied=String(req.headers.authorization||'').replace(/^Bearer /i,'');
 const a=Buffer.from(supplied),b=Buffer.from(ACCESS_TOKEN);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function readBody(req){
 let size=0,parts=[];
 for await(const chunk of req){
  size+=chunk.length;
  if(size>32768)throw Object.assign(Error('Request too large'),{status:413});
  parts.push(chunk);
 }
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}
 catch{throw Object.assign(Error('Invalid JSON'),{status:400})}
}
function permitted(req){
 const origin=req.headers.origin||'';
 return !origin||ALLOWED_ORIGINS.includes(origin);
}
function rateExceeded(req){
 const now=Date.now();
 const identity=String(req.socket.remoteAddress||'unknown');
 const item=attempts.get(identity);
 if(!item||now-item.start>60000){attempts.set(identity,{start:now,count:1});return false}
 item.count++;
 return item.count>MAX_PER_MINUTE;
}
function responseText(body){
 if(typeof body.output_text==='string'&&body.output_text)return body.output_text;
 for(const output of body.output||[]){
  for(const part of output.content||[]){
   if(part.type==='output_text'&&typeof part.text==='string')return part.text;
  }
 }
 return '';
}
const format={
 type:'json_schema',name:'rollblink_social_copy',strict:true,
 schema:{type:'object',additionalProperties:false,properties:{
  title:{type:'string'},copy:{type:'string'}
 },required:['title','copy']}
};

export const server=createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 if(!permitted(req)){respond(res,403,{error:'Origin not allowed.'});return}
 if(req.method==='OPTIONS'){
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS',
   'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'1800'});res.end();return;
 }
 if(req.url==='/health'&&req.method==='GET'){respond(res,200,{status:'ok',aiConfigured:Boolean(OPENAI_KEY&&ACCESS_TOKEN)},origin);return}
 if(await handleSocial(req,res,{authorized,readBody,respond,origin}))return;
 if(req.url==='/api/ai/status'&&req.method==='GET'){
  if(!authorized(req)){respond(res,401,{error:'Unauthorized.'},origin);return}
  respond(res,200,{configured:Boolean(OPENAI_KEY),model:MODEL,keyLocation:'server-secret',mode:'beta'},origin);return
 }
 if(req.url==='/api/creator-kit'&&req.method==='POST'){
  if(!authorized(req)){respond(res,401,{error:'Unauthorized.'},origin);return}
  if(rateExceeded(req)){respond(res,429,{error:'Too many AI requests. Retry after a minute.'},origin);return}
  try{
   const input=await readBody(req);
   const result=await requestCreatorKit(input,{key:OPENAI_KEY,model:MODEL});
   respond(res,200,result,origin);
  }catch(e){
   const status=Number.isInteger(e.status)&&e.status>=400&&e.status<600?e.status:500;
   respond(res,status,{error:status===500?'AI Creator Kit failed. Try again.':String(e.message)},origin);
  }
  return;
 }
 if(req.url!=='/api/generate'||req.method!=='POST'){respond(res,404,{error:'Not found.'},origin);return}
 if(!authorized(req)){respond(res,401,{error:'Unauthorized.'},origin);return}
 if(!OPENAI_KEY){respond(res,503,{error:'OPENAI_API_KEY is not configured on the server.'},origin);return}
 if(rateExceeded(req)){respond(res,429,{error:'Generation limit reached. Try again shortly.'},origin);return}
 try{
  const input=await readBody(req);
  const transcript=typeof input.transcript==='string'?input.transcript.trim():'';
  const platform=input.platform;
  if(!transcript||transcript.length>16000||!allowedPlatforms.has(platform)){
   respond(res,400,{error:'Provide a transcript under 16,000 characters and a supported platform.'},origin);return;
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  let upstream;
  try{
   upstream=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
    signal:controller.signal,
    body:JSON.stringify({
     model:MODEL,store:false,max_output_tokens:750,
     instructions:'You are a precise, exceptionally skilled short-form video copywriter. Write one compelling but accurate on-screen opening title and a ready-to-paste social post in the creator original voice. Use ONLY facts present in the transcript; no invented numbers, quotes, dramatic claims, experiences, promotions, or calls-to-action unsupported by the transcript. Do not duplicate the entire transcript. Tailor length, line breaks, CTA and restrained hashtags to the requested platform. Avoid generic AI marketing clichés. Title maximum 65 characters. The post must preserve the original meaning. Respond only with the specified structured JSON.',
     input:[{role:'user',content:'Platform: '+platform+'\nTRANSCRIPT:\n'+transcript}],
     text:{format}
    })
   });
  }finally{clearTimeout(timeout)}
  if(!upstream.ok){respond(res,502,{error:'AI provider could not generate copy. Check server credentials and limits.'},origin);return}
  const payload=await upstream.json();
  const raw=responseText(payload);
  let result;
  try{result=JSON.parse(raw)}catch{throw Error('Model returned invalid JSON')}
  if(typeof result.title!=='string'||typeof result.copy!=='string'||!result.title.trim()||!result.copy.trim())
   throw Error('Model returned empty copy');
  respond(res,200,{title:result.title.slice(0,150),copy:result.copy.slice(0,5000),mode:'ai'},origin);
 }catch(e){
  const status=e.status||500;
  const message=status===400||status===413?e.message:'Generation failed. Please retry.';
  respond(res,status,{error:message},origin);
 }
});
if(process.env.NODE_ENV!=='test')server.listen(PORT,'0.0.0.0',()=>process.stdout.write('Rollblink AI server listening on '+PORT+'\n'));
