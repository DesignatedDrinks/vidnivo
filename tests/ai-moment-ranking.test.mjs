import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAiMomentRanking} from '../src/domain/aiMomentRanking.ts';
const first={id:'moment:1000:13000',startMs:1000,endMs:13000,
 preview:'Here is one moment.',explanation:'Local discovery.'};
const second={id:'moment:18000:34000',startMs:18000,endMs:34000,
 preview:'Here is the second.',explanation:'Local discovery.'};
test('AI reranks only original moments, never modifies clip timing or transcript',()=>{
 const originals=[first,second];
 const ranked=applyAiMomentRanking(originals,{aiRanked:true,rankings:[
  {id:second.id,reason:'Strong clear payoff.',score:91},
  {id:first.id,reason:'Good contextual hook.',score:76}
 ]});
 assert.equal(ranked[0].id,second.id);
 assert.equal(ranked[0].startMs,18000);
 assert.equal(ranked[0].endMs,34000);
 assert.equal(ranked[0].aiScore,91);
 assert.equal(originals[1].aiScore,undefined);
});
test('rejects hallucinated, duplicated and malicious AI timestamp substitutions',()=>{
 const originals=[first,second];
 assert.throws(()=>applyAiMomentRanking(originals,{aiRanked:true,rankings:[
  {id:'moment:0:90000',reason:'Invented ID.',score:100},
  {id:first.id,reason:'Original.',score:75}]}));
 assert.throws(()=>applyAiMomentRanking(originals,{aiRanked:true,rankings:[
  {id:first.id,reason:'First valid.',score:80},
  {id:first.id,reason:'Duplicate.',score:70}]}));
 assert.throws(()=>applyAiMomentRanking(originals,{aiRanked:false,rankings:[]}));
 assert.throws(()=>applyAiMomentRanking(originals,{aiRanked:true,rankings:[
  {id:second.id,reason:'Great moment.',score:1000},
  {id:first.id,reason:'Safe enough.',score:80}]}));
});
