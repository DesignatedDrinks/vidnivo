import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addText} from '../src/domain/timeline.ts';
import {addCaptionCues} from '../src/domain/captions.ts';
import {transcriptForSocial,parseSocialPostDraft,socialPrompt} from '../src/social/copy.ts';
const sample={instagram:'IG hook #story',tiktok:'TikTok #story',youtube:'A useful description',facebook:'Watch this',linkedin:'Lessons learned',youtubeTitle:'Lessons from my video'};
test('only spoken captions enter social prompt, not decorative titles',()=>{
 let p=addText(createProject('An interview'),'SECRET DECORATIVE TITLE',0);
 p=addCaptionCues(p,[{startMs:100,endMs:400,text:'I left the old job.'},{startMs:500,endMs:800,text:'Built something new.'}]);
 assert.equal(transcriptForSocial(p),'I left the old job. Built something new.');
 const prompt=socialPrompt(p,'Keep it conversational');
 assert.ok(prompt.input.includes('something new'));
 assert.ok(!prompt.input.includes('SECRET DECORATIVE'));
 assert.ok(prompt.input.includes('Keep it conversational'));
});
test('no transcript refuses to hallucinate a video story',()=>{
 assert.throws(()=>transcriptForSocial(createProject()),/Generate or import/);
});
test('all five posts and YouTube title required',()=>{
 assert.deepEqual(parseSocialPostDraft(sample),sample);
 assert.throws(()=>parseSocialPostDraft({...sample,tiktok:''}),/tiktok/);
 assert.throws(()=>parseSocialPostDraft({...sample,instagram:'x'.repeat(2500)}),/limit/);
});
