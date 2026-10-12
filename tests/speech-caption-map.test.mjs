import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWordsToTimeline, groupRecognizedWords } from '../src/domain/captions.ts';
test('recognition maps correctly through trimmed speed-altered clips',()=>{
 const clip={startMs:3000,inMs:2000,outMs:6000,speed:2};
 const words=[
  {startMs:1000,endMs:1300,text:'discard'},
  {startMs:2100,endMs:2450,text:'Hello'},
  {startMs:2500,endMs:2900,text:'world.'},
  {startMs:6500,endMs:6900,text:'discard'}
 ];
 const mapped=mapWordsToTimeline(words,clip);
 assert.deepEqual(mapped,[{startMs:3050,endMs:3225,text:'Hello'}, {startMs:3250,endMs:3450,text:'world.'}]);
 assert.deepEqual(groupRecognizedWords(mapped),[{startMs:3050,endMs:3450,text:'Hello world.'}]);
});
test('groups words with pauses, word limits and sentence endings',()=>{
 const input=[
 {startMs:0,endMs:150,text:'Start'}, {startMs:190,endMs:350,text:'here.'},
 {startMs:1600,endMs:1790,text:'Next'}, {startMs:1820,endMs:2100,text:'sentence'}
 ];
 const cues=groupRecognizedWords(input);
 assert.equal(cues.length,2);
 assert.equal(cues[0].text,'Start here.');
 assert.equal(cues[1].startMs,1600);
});
test('limits mapped words to actual source bounds',()=>{
 const words=[{startMs:1000,endMs:2500,text:'part'}, {startMs:3900,endMs:4500,text:'end'}];
 assert.deepEqual(mapWordsToTimeline(words,{startMs:500,inMs:2000,outMs:4000,speed:1}),[
 {startMs:500,endMs:1000,text:'part'},{startMs:2400,endMs:2500,text:'end'}
 ]);
});
