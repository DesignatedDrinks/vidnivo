import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject, addText, validateProject} from '../src/domain/timeline.ts';
import {splitCaption,mergeCaptionWithNext,nudgeCaption,shiftAllCaptions,fixSentenceCase} from '../src/domain/captionEditing.ts';
test('split then merge retains accurate total caption timing',()=>{
 let p=addText(createProject(),'First two words here',2000,4000);
 const id=p.texts[0].id;
 p=splitCaption(p,id);
 assert.equal(p.texts.length,2);
 assert.equal(p.texts[0].endMs,p.texts[1].startMs);
 assert.equal(p.texts[1].endMs,6000);
 p=mergeCaptionWithNext(p,id);
 assert.equal(p.texts.length,1);
 assert.equal(p.texts[0].text,'First two words here');
 assert.equal(p.texts[0].startMs,2000);assert.equal(p.texts[0].endMs,6000);
 validateProject(p);
});
test('nudge and shift preserve durations and do not create negative times',()=>{
 let p=addText(createProject(),'one',50,3000);
 const originalDuration=p.texts[0].endMs-p.texts[0].startMs;
 p=nudgeCaption(p,p.texts[0].id,-500);
 assert.equal(p.texts[0].startMs,0);
 assert.equal(p.texts[0].endMs-p.texts[0].startMs,originalDuration);
 p=shiftAllCaptions(p,250);
 assert.equal(p.texts[0].startMs,250);
 p=shiftAllCaptions(p,-500);
 assert.equal(p.texts[0].startMs,0);
});
test('sentence capitalization keeps acronym and contractions intact',()=>{
 let p=addText(createProject(),"hello USA. it's nice! welcome",0);
 p=fixSentenceCase(p);
 assert.equal(p.texts[0].text,"Hello USA. It's nice! Welcome");
 assert.equal(fixSentenceCase(p),p);
});
