import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCreatorRequest,normalizeCreatorResult,creatorFormat,requestCreatorKit,CREATOR_MODEL_DEFAULT} from '../server/creator.mjs';

const sample={
 onScreenTitle:'The decision nobody talks about',
 hooks:['Here is what finally changed my mind','The expensive mistake I nearly made','I wish someone had told me this'],
 instagram:'The decision I almost got wrong. Here is why.',tiktok:'That one decision changed my plan.',
 youtube:'A candid account of the decision and what changed.',youtubeTitle:'What Changed My Mind',
 facebook:'I went back and forth on this decision. Here is why.',linkedin:'The decision required me to rethink my assumptions.',
 editSuggestion:'Try placing the exact phrase "what changed my mind" on screen.'
};
test('creator input rejects missing or long transcripts',()=>{
 assert.throws(()=>prepareCreatorRequest({transcript:'short'}),/8–16,000/);
 assert.throws(()=>prepareCreatorRequest({transcript:'a'.repeat(16001)}),/8–16,000/);
 assert.throws(()=>prepareCreatorRequest(null),/transcript/i);
});
test('creator input clips optional direction and defaults to natural tone',()=>{
 const x=prepareCreatorRequest({transcript:'These are real spoken words in my video',tone:'unknown',direction:'z'.repeat(2000)});
 assert.equal(x.tone,'natural');assert.equal(x.direction.length,1200);
});
test('creator output requires three distinct-shaped hooks and valid platform posts',()=>{
 assert.deepEqual(normalizeCreatorResult(sample).hooks,sample.hooks);
 assert.throws(()=>normalizeCreatorResult({...sample,hooks:['one']}),/three usable hook/);
 assert.throws(()=>normalizeCreatorResult({...sample,instagram:'X'.repeat(2201)}),/character limit/);
 assert.throws(()=>normalizeCreatorResult({...sample,youtubeTitle:''}),/youtubeTitle/);
});
test('creator strict JSON schema includes every required text field',()=>{
 assert.equal(creatorFormat.schema.additionalProperties,false);
 assert.equal(creatorFormat.schema.required.length,10);
 assert.equal(CREATOR_MODEL_DEFAULT,'gpt-5.4-mini');
});
test('creator API uses official Responses with store:false and structured output',async()=>{
 let received;
 const fake=async (url,options)=>{
  received={url,options,body:JSON.parse(options.body)};
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(sample)}]}]})};
 };
 const result=await requestCreatorKit({transcript:'I changed my mind after reconsidering the costs and risks.',tone:'thoughtful'},
  {key:'sk-test-no-real-secret',fetcher:fake,timeoutMs:500});
 assert.equal(received.url,'https://api.openai.com/v1/responses');
 assert.equal(received.body.store,false);
 assert.equal(received.body.text.format.name,'rollblink_creator_kit');
 assert.equal(received.options.headers.Authorization,'Bearer sk-test-no-real-secret');
 assert.equal(result.onScreenTitle,sample.onScreenTitle);
 assert.equal(result.reviewRequired,true);
});
test('creator API fails closed on malformed outputs and missing key',async()=>{
 await assert.rejects(requestCreatorKit({transcript:'Spoken text from video but no API key.'}),/OPENAI_API_KEY/);
 await assert.rejects(requestCreatorKit({transcript:'Spoken text from video but invalid returned JSON.'},{
  key:'test',fetcher:async()=>({ok:true,json:async()=>({output_text:'not-json'})})
 }),/incomplete structured text/);
});
