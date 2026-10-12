import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addText, editTextLayer, durationMs, validateProject } from '../src/domain/timeline.ts';
test('text can be edited and timeline duration is recomputed', () => {
 const original=addText(createProject(),'One',0,1000), id=original.texts[0].id;
 const edited=editTextLayer(original,id,{text:' Two ',fontSize:42,color:'#aabbcc',x:0.3,y:0.6,endMs:5000});
 assert.equal(edited.texts[0].text,'Two'); assert.equal(edited.texts[0].fontSize,42);
 assert.equal(edited.texts[0].color,'#AABBCC');assert.equal(edited.texts[0].x,0.3);
 assert.equal(durationMs(edited),5000);assert.equal(original.texts[0].text,'One');
 assert.equal(edited.revision,original.revision+1);validateProject(edited);
});
test('font, timing and placement use safe limits',()=>{
 let p=addText(createProject(),'Caption',1500,1500);
 p=editTextLayer(p,p.texts[0].id,{startMs:-500,endMs:10,fontSize:999,x:-8,y:19,color:'notacolor'});
 assert.equal(p.texts[0].startMs,0);assert.equal(p.texts[0].endMs,250);
 assert.equal(p.texts[0].fontSize,96);assert.equal(p.texts[0].x,0.1);
 assert.equal(p.texts[0].y,0.9);assert.equal(p.texts[0].color,'#FFFFFF');
 validateProject(p);
});
test('empty edits are rejected and original preserved',()=>{
 const p=addText(createProject(),'a',0);
 assert.equal(editTextLayer(p,p.texts[0].id,{text:'  '}),p);
 assert.equal(editTextLayer(p,'missing',{text:'Test'}),p);
});
