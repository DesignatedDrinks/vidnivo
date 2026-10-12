import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,editClip} from '../src/domain/timeline.ts';
import {audibleClipsAt} from '../src/domain/audioPlayback.ts';
const asset=id=>({id,kind:'audio',uri:'file:///tmp/'+id+'.m4a',filename:id+'.m4a',durationMs:8000,width:0,height:0});
test('overlapping voiceover and music are both audible during preview',()=>{
 let p=addAsset(createProject(),asset('music'),'audio',0);
 p=addAsset(p,asset('speech'),'audio',2500);
 const tracks=audibleClipsAt(p,3000);
 assert.equal(tracks.length,2);
 assert.equal(tracks[0].uri,'file:///tmp/music.m4a');
 assert.equal(tracks[0].offsetSeconds,3);
 assert.equal(tracks[1].offsetSeconds,.5);
});
test('muted and zero-volume audio are excluded without muting another track',()=>{
 let p=addAsset(createProject(),asset('music'),'audio',0);
 p=addAsset(p,asset('speech'),'audio',0);
 p=editClip(p,p.clips[0].id,{muted:true});
 assert.equal(audibleClipsAt(p,3000).length,1);
 p=editClip(p,p.clips[1].id,{volume:0});
 assert.equal(audibleClipsAt(p,3000).length,0);
});
test('audio clip at source trim plays from trimmed input offset',()=>{
 let p=addAsset(createProject(),asset('music'),'audio',1000);
 p={...p,clips:[{...p.clips[0],inMs:1500,outMs:7000,speed:2}]};
 assert.equal(audibleClipsAt(p,2000)[0].offsetSeconds,3.5);
 assert.equal(audibleClipsAt(p,5000).length,0);
});
