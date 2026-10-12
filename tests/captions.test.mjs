import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/domain/timeline.ts';
import { parseCaptions, addCaptionCues, serializeSrt, restyleCaptions, captionsFromProject } from '../src/domain/captions.ts';
test('SRT and WebVTT with BOM and multi-line cues parse in order', () => {
 const srt='\uFEFF2\r\n00:00:02,500 --> 00:00:04,000\r\nSecond line\r\n\r\n1\r\n00:00:00,000 --> 00:00:02,000\r\nHello\r\nworld\r\n';
 assert.deepEqual(parseCaptions(srt), [{startMs:0,endMs:2000,text:'Hello world'}, {startMs:2500,endMs:4000,text:'Second line'}]);
 const vtt='WEBVTT\n\n00:00:01.000 --> 00:00:02.500 align:start\n<b>Testing</b>\n';
 assert.deepEqual(parseCaptions(vtt),[{startMs:1000,endMs:2500,text:'Testing'}]);
});
test('captions apply as one edit, styles and export SRT accurately',()=>{
 const cue=[{startMs:250,endMs:1700,text:'Hello world'}, {startMs:2000,endMs:3500,text:'Welcome'}];
 const initial=createProject();
 const p=addCaptionCues(initial,cue,'punch');
 assert.equal(p.revision,initial.revision+1);
 assert.equal(p.texts.length,2);
 assert.equal(p.texts[0].color,'#FFDD57');
 const restyled=restyleCaptions(p,'neon');
 assert.equal(restyled.texts[0].color,'#23D4E9');
 assert.deepEqual(parseCaptions(serializeSrt(captionsFromProject(restyled))),cue);
});
test('ignore malformed cues, protect against giant input and invalid presets not exposed',()=>{
 assert.equal(parseCaptions('00:00:03,000 --> 00:00:02,000\nBad').length,0);
 assert.equal(parseCaptions('00:60:00,000 --> 00:61:00,000\nInvalid').length,0);
 assert.throws(()=>parseCaptions('a'.repeat(2_000_001)),/exceeds/);
 assert.equal(addCaptionCues(createProject(),[]).texts.length,0);
});
