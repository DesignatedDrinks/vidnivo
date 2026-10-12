import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupportInput,supportFallback,cleanDiagnosis,diagnoseWithOpenAI} from '../src/supportCore.mjs';
const diagnostics={screen:'export',platform:'ios',quality:1080,clipCount:2,
 mediaCount:2,missingSourceCount:0,saveFailed:false,exportSupported:true,cloudSignedIn:true};
test('support diagnostics reject arbitrary personal data and malformed requests',()=>{
 const request=validateSupportInput({issue:'My export does not work',diagnostics:{
  ...diagnostics,privateTranscript:'do not share',cloudToken:'secret',
  devicePath:'file:///private/clip.mov'}});
 assert.equal(request.diagnostics.privateTranscript,undefined);
 assert.equal(request.diagnostics.cloudToken,undefined);
 assert.equal(request.diagnostics.devicePath,undefined);
 assert.equal(request.diagnostics.clipCount,2);
 assert.throws(()=>validateSupportInput({issue:'x',diagnostics}),{status:400});
 assert.throws(()=>validateSupportInput({issue:'x'.repeat(1201),diagnostics}),{status:400});
});
test('deterministic support only proposes reversible known actions',()=>{
 const save=supportFallback({issue:'Local save fails',diagnostics:{...diagnostics,saveFailed:true}});
 assert.equal(save.action,'retry-save');
 const missing=supportFallback({issue:'My file is gone',diagnostics:{...diagnostics,missingSourceCount:1}});
 assert.equal(missing.action,'none');
 const exportFix=supportFallback({issue:'Export freezes',diagnostics});
 assert.equal(exportFix.action,'set-export-720');
 assert.equal(supportFallback({issue:'Export freezes',diagnostics:{...diagnostics,exportSupported:false}}).action,'none');
});
test('model output cannot execute arbitrary code or unsupported patches',()=>{
 const fallback=supportFallback({issue:'Video preview freezes',diagnostics});
 assert.equal(cleanDiagnosis({answer:'I deployed a fix',action:'run-shell',category:'other'},fallback).action,'none');
 assert.equal(cleanDiagnosis({answer:'Reset preview',action:'restart-preview',category:'playback'},fallback).action,'restart-preview');
 assert.equal(cleanDiagnosis({answer:'x'.repeat(1400),action:'restart-preview',category:'playback'},fallback).aiGenerated,false);
});
test('support OpenAI request uses server credentials, JSON schema and no retention',async()=>{
 let invoked=0;
 const mock=async(url,init)=>{
  invoked++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(init.headers.Authorization,'Bearer server-test-key');
  const payload=JSON.parse(init.body);
  assert.equal(payload.store,false);
  assert.equal(payload.text.format.type,'json_schema');
  assert.equal(payload.input.includes('cloudToken'),false);
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({
   answer:'Try the preview reset.',action:'restart-preview',category:'playback'
  })}]}]})};
 };
 const result=await diagnoseWithOpenAI({issue:'Preview keeps freezing',diagnostics:{
  ...diagnostics,cloudToken:'secret'}},{apiKey:'server-test-key',fetcher:mock});
 assert.equal(invoked,1);
 assert.equal(result.aiGenerated,true);
 assert.equal(result.action,'restart-preview');
 const offline=await diagnoseWithOpenAI({issue:'Preview keeps freezing',diagnostics},
  {apiKey:'',fetcher:()=>{throw Error('Should not call model');}});
 assert.equal(offline.aiGenerated,false);
 assert.equal(offline.available,false);
});
test('AI API failure falls back to verified built-in advice',async()=>{
 const result=await diagnoseWithOpenAI({issue:'Export failed',diagnostics},
  {apiKey:'server-test-key',fetcher:async()=>({ok:false,status:429})});
 assert.equal(result.aiGenerated,false);
 assert.equal(result.action,'set-export-720');
});
