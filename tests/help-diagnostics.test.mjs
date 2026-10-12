import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset} from '../src/domain/timeline.ts';
import {collectSupportDiagnostics,localSupportDiagnosis,safeSupportDiagnosis} from '../src/support/diagnostics.ts';
const basic={screen:'editor',platform:'ios',quality:1080,saveFailed:false,
 exportSupported:true,cloudSignedIn:true};
test('help diagnostics count broken sources without exposing filenames or video contents',()=>{
 let draft=createProject('Private medical appointment interview');
 draft=addAsset(draft,{id:'asset_source001',uri:'file:///private/sensitive-name.mov',
  filename:'sensitive-name.mov',kind:'video',durationMs:10000,width:1080,height:1920});
 const diagnostics=collectSupportDiagnostics(draft,basic,()=>false);
 assert.equal(diagnostics.missingSourceCount,1);
 assert.equal(diagnostics.clipCount,1);
 const encoded=JSON.stringify(diagnostics);
 assert.doesNotMatch(encoded,/appointment|sensitive-name|private\/|\.mov/);
});
test('local help can recover playback safely without editing project data',()=>{
 const diagnostics=collectSupportDiagnostics(null,basic,()=>false);
 const fix=localSupportDiagnosis('My preview freezes',diagnostics);
 assert.equal(fix.action,'restart-preview');
 assert.equal(fix.aiGenerated,false);
 assert.equal(localSupportDiagnosis('I cannot export',
  {...diagnostics,exportSupported:false}).action,'none');
});
test('never accept a model response that asks for code execution',()=>{
 const fallback=localSupportDiagnosis('My preview freezes',
  collectSupportDiagnostics(null,basic,()=>false));
 const unsafe=safeSupportDiagnosis({answer:'Execute a patch',action:'execute-source',category:'other',
  aiGenerated:true,available:true},fallback);
 assert.equal(unsafe.aiGenerated,false);
 assert.equal(unsafe.action,'restart-preview');
});
