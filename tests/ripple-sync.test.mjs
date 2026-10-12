import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addText,rippleSpeedClip,rippleTrimClip,rippleDeleteClip,validateProject} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
const vid=id=>({id,kind:'video',uri:'file:///tmp/'+id+'.mp4',filename:id+'.mp4',durationMs:5000,width:1080,height:1920});
const audio={id:'sound',kind:'audio',uri:'file:///sound.mp3',filename:'sound.mp3',durationMs:2000,width:0,height:0};
function create(){let p=addAsset(addAsset(createProject(),vid('one')),vid('two'));p=addAsset(p,audio,'audio',6000);return addText(p,'Later',6000,1500);}
test('speed changes ripple later audio and captions as well as video',()=>{
 let p=create();p=rippleSpeedClip(p,p.clips[0].id,2);
 assert.equal(p.clips[1].startMs,2500);
 assert.equal(p.clips[2].startMs,3500);
 assert.equal(p.texts[0].startMs,3500);
 assert.equal(createExportPlan(p).durationMs,7500);
});
test('ripple trim shifts following tracks and maintains legal captions',()=>{
 let p=create();p=rippleTrimClip(p,p.clips[0].id,'right',-1000);
 assert.equal(p.clips[1].startMs,4000);
 assert.equal(p.clips[2].startMs,5000);
 assert.equal(p.texts[0].startMs,5000);
 validateProject(p);
});
test('deletion closes all later tracks and removes wholly covered caption',()=>{
 let p=create();p=addText(p,'Inside',500,1200);
 p=rippleDeleteClip(p,p.clips[0].id);
 assert.equal(p.clips[0].startMs,0);
 assert.equal(p.clips[1].startMs,1000);
 assert.equal(p.texts.length,1);
 assert.equal(p.texts[0].text,'Later');
 assert.equal(p.texts[0].startMs,1000);
 validateProject(p);
});
