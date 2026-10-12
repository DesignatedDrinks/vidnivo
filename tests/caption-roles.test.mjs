import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject, addText} from '../src/domain/timeline.ts';
import {addCaptionCues,restyleCaptions,captionsFromProject} from '../src/domain/captions.ts';
import {shiftAllCaptions,fixSentenceCase,mergeCaptionWithNext} from '../src/domain/captionEditing.ts';
test('decorative titles are never exported as subtitles or restyled by caption presets',()=>{
 let p=addText(createProject(),'My Title',0,3000);
 p=addCaptionCues(p,[{startMs:1000,endMs:1800,text:'hello world.'}],'classic');
 assert.equal(p.texts[0].role,'title');
 assert.equal(p.texts[1].role,'caption');
 assert.deepEqual(captionsFromProject(p),[{startMs:1000,endMs:1800,text:'hello world.'}]);
 const original={...p.texts[0]};
 p=restyleCaptions(p,'punch');
 assert.deepEqual(p.texts[0],original);
 assert.equal(p.texts[1].color,'#FFDD57');
 p=fixSentenceCase(p);
 assert.equal(p.texts[0].text,'My Title');
 assert.equal(p.texts[1].text,'Hello world.');
 p=shiftAllCaptions(p,350);
 assert.equal(p.texts[0].startMs,0);
 assert.equal(p.texts[1].startMs,1350);
});
test('caption merge cannot accidentally swallow decorative text',()=>{
 let p=addText(createProject(),'HEADLINE',0,2000);
 p=addCaptionCues(p,[{startMs:1500,endMs:2400,text:'hi'}]);
 const cap=p.texts.find(t=>t.role==='caption');
 assert.equal(mergeCaptionWithNext(p,cap.id),p);
});
