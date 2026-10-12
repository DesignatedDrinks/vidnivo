import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMomentRankingInput,cleanRanking,rankMomentsWithAI} from '../src/momentRankCore.mjs';
const candidates=[
 {id:'moment:1000:16000',preview:'I started with an old idea. Here is what changed everything.',durationMs:15000},
 {id:'moment:22000:39000',preview:'That was the single most surprising thing I learned.',durationMs:17000}
];
test('AI moment ranking accepts only bounded caption excerpts',()=>{
 assert.equal(validateMomentRankingInput({moments:candidates}).moments.length,2);
 assert.throws(()=>validateMomentRankingInput({moments:[...candidates,candidates[0]]}),{status:400});
 assert.throws(()=>validateMomentRankingInput({moments:[
  {...candidates[0],id:'../../secret'}]}),{status:400});
 assert.throws(()=>validateMomentRankingInput({moments:[
  {...candidates[0],preview:'x'.repeat(241)}]}),{status:400});
});
test('AI rankings are deterministic and cannot invent or duplicate clip IDs',()=>{
 const good={rankings:[
  {id:candidates[1].id,score:87,reason:'Clear curiosity gap.'},
  {id:candidates[0].id,score:75,reason:'Strong complete setup.'}]};
 assert.deepEqual(cleanRanking(good,candidates).map(x=>x.id),
  [candidates[1].id,candidates[0].id]);
 assert.throws(()=>cleanRanking({rankings:[good.rankings[0],good.rankings[0]]},candidates));
 assert.throws(()=>cleanRanking({rankings:[{...good.rankings[0],id:'moment:99:101'},good.rankings[1]]},candidates));
});
test('server-side AI scoring never sends media URIs, requests storage or scripts',async()=>{
 let calls=0;
 const fetcher=async(uri,options)=>{
  calls++;
  assert.equal(uri,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization,'Bearer server-key');
  const input=JSON.parse(options.body);
  assert.equal(input.store,false);
  assert.equal(input.input.includes('file://'),false);
  assert.equal(input.instructions.includes('Never claim to have seen footage'),true);
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',
   text:JSON.stringify({rankings:[
    {id:candidates[1].id,score:92,reason:'Stand-alone compelling statement.'},
    {id:candidates[0].id,score:67,reason:'Clear introductory setup.'}
   ]})}]}]})};
 };
 const result=await rankMomentsWithAI({moments:candidates},{apiKey:'server-key',fetcher});
 assert.equal(calls,1);
 assert.equal(result.aiRanked,true);
 assert.equal(result.rankings[0].id,candidates[1].id);
 const local=await rankMomentsWithAI({moments:candidates},{apiKey:''});
 assert.equal(local.aiRanked,false);
 assert.deepEqual(local.rankings,[]);
});
