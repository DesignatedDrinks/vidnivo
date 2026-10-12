import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/timeline.ts';
import {addCaptionCues} from '../src/domain/captions.ts';
import {generateSocialPostDraft,readResponseText,OPENAI_MODEL} from '../src/social/openai.ts';
const expected={instagram:'IG #video',tiktok:'TikTok',youtube:'YouTube description',facebook:'Facebook',linkedin:'LinkedIn',youtubeTitle:'Accurate video title'};
const project=addCaptionCues(createProject('Talk'),[{startMs:0,endMs:2000,text:'It takes time to build a business.'}]);
const key='sk-test-token-for-unit-tests-only';
test('real OpenAI Responses API request includes transcript, strict schema and disabled retention',async()=>{
 let captured;
 const fetcher=async(url,options)=>{
  captured={url,options};
  return {ok:true,status:200,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(expected)}]}]})};
 };
 const drafts=await generateSocialPostDraft(project,key,'Make it conversational',fetcher);
 assert.deepEqual(drafts,expected);
 assert.equal(captured.url,'https://api.openai.com/v1/responses');
 const body=JSON.parse(captured.options.body);
 assert.equal(body.store,false);
 assert.equal(body.model,OPENAI_MODEL);
 assert.ok(body.input.includes('build a business'));
 assert.ok(body.input.includes('conversational'));
 assert.equal(body.text.format.type,'json_schema');
 assert.equal(captured.options.headers.Authorization,'Bearer '+key);
 assert.ok(!JSON.stringify(body).includes(key));
});
test('never disclose keys through request errors',async()=>{
 const rejected=async()=>({ok:false,status:401,json:async()=>({error:{message:'secret content '+key}})});
 await assert.rejects(()=>generateSocialPostDraft(project,key,'',rejected),e=>e.message.includes('rejected')&&!e.message.includes(key));
 const limited=async()=>({ok:false,status:429,json:async()=>({error:{message:key}})});
 await assert.rejects(()=>generateSocialPostDraft(project,key,'',limited),e=>e.message.includes('limit')&&!e.message.includes(key));
});
test('bad OpenAI responses are rejected instead of silently inventing social posts',async()=>{
 assert.throws(()=>readResponseText({output:[]}),/any text/);
 const invalid=async()=>({ok:true,status:200,json:async()=>({output:[{content:[{type:'output_text',text:'Not JSON'}]}]})});
 await assert.rejects(()=>generateSocialPostDraft(project,key,'',invalid),/incomplete/);
 await assert.rejects(()=>generateSocialPostDraft(createProject(),key,'',invalid),/spoken captions/);
});
