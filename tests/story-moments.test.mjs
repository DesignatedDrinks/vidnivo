import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,setProjectLook} from '../src/domain/timeline.ts';
import {addCaptionCues} from '../src/domain/captions.ts';
import {proposeStoryMoments,createStoryShort} from '../src/domain/storyMoments.ts';
import {createExportPlan} from '../src/export/plan.ts';
const video=id=>({id,filename:id+'.mp4',kind:'video',uri:'file:///tmp/'+id+'.mp4',
 durationMs:20000,width:1080,height:1920});
function fixture(){
 let p=addAsset(addAsset(createProject('Interview'),video('a')),video('b'));
 p=setProjectLook(p,'sunset',70);
 p=addCaptionCues(p,[
 {startMs:0,endMs:4000,text:'Here is my first statement.'},
 {startMs:4000,endMs:9000,text:'It gives some context.'},
 {startMs:10000,endMs:16000,text:'The most important lesson was patience.'},
 {startMs:20000,endMs:27000,text:'Then we learned to rebuild stronger.'},
 {startMs:27000,endMs:34000,text:'And here is why that matters.'}
 ]);
 return p;
}
test('storyfinder recommends context-bound complete moments and never cuts originals',()=>{
 const p=fixture(),list=proposeStoryMoments(p);
 assert.ok(list.length>=2,'should find complete narrative sections');
 assert.ok(list.every(v=>v.endMs-v.startMs>=12000 && v.endMs-v.startMs<=60000));
 assert.ok(list.every(v=>v.preview && v.explanation));
 const before=JSON.stringify(p);
 const derived=createStoryShort(p,list[0]);
 assert.equal(JSON.stringify(p),before);
 assert.notEqual(derived.id,p.id);
 assert.equal(derived.look.preset,'sunset');
 assert.equal(derived.look.intensity,70);
 assert.equal(createExportPlan(derived).durationMs,list[0].endMs-list[0].startMs);
 assert.notEqual(derived.clips[0].id,p.clips[0].id);
});
test('short from middle of two source clips renormalizes audio and subtitles',()=>{
 const p=fixture();
 const from={id:'manual',startMs:12000,endMs:27000,preview:'Good story',explanation:'Selected by editor'};
 const short=createStoryShort(p,from);
 assert.equal(short.clips.filter(c=>c.track==='video').length,2);
 assert.equal(createExportPlan(short).durationMs,15000);
 assert.equal(short.clips.find(c=>c.track==='video').inMs,12000);
 assert.ok(short.texts.every(t=>t.startMs>=0 && t.endMs<=15000));
});
test('no transcripts or incomplete sentences cannot be labeled as viral clips',()=>{
 let p=addAsset(createProject(),video('a'));
 assert.deepEqual(proposeStoryMoments(p),[]);
 p=addCaptionCues(p,[{startMs:0,endMs:16000,text:'some incomplete talk'}]);
 assert.deepEqual(proposeStoryMoments(p),[]);
});
test('unsupported gaps and invalid time windows are safely rejected',()=>{
 let p=fixture();const gap={...p,clips:[p.clips[0],{...p.clips[1],startMs:30000}]};
 assert.throws(()=>createStoryShort(gap,{id:'m',startMs:18000,endMs:35000,preview:'',explanation:''}),/gap/);
 assert.throws(()=>proposeStoryMoments(p,{minMs:999}),/settings/);
 assert.throws(()=>createStoryShort(p,{id:'m',startMs:-10,endMs:10000,preview:'',explanation:''}),/range/);
});
