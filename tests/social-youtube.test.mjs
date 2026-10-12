import test from 'node:test';
import assert from 'node:assert/strict';
import {beginYouTubeUpload,completedYouTubeUpload,validateYouTubePost} from '../src/social/youtubeCore.ts';
const sample={title:'Hello world',description:'Test video.',privacy:'private',size:100};
test('YouTube upload requires OAuth and explicit private-by-default metadata',async()=>{
 let observed;
 const location='https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc';
 const mock=async(url,init)=>{
  observed={url,init};return{ok:true,status:200,headers:{get:k=>k==='location'?location:null}}
 };
 assert.equal(await beginYouTubeUpload('token123',sample,mock),location);
 const body=JSON.parse(observed.init.body);
 assert.equal(body.status.privacyStatus,'private');
 assert.equal(body.snippet.title,'Hello world');
 assert.equal(observed.init.headers.Authorization,'Bearer token123');
 await assert.rejects(()=>beginYouTubeUpload('',sample,mock),/Connect/);
});
test('YouTube rejects unexpected upload URLs before transmitting media',async()=>{
 const fake=async()=>({ok:true,status:200,headers:{get:()=> 'https://bad.example.com/steal'}});
 await assert.rejects(()=>beginYouTubeUpload('token',sample,fake),/unexpected/);
});
test('YouTube only reports completion when it receives a valid video id',()=>{
 assert.equal(completedYouTubeUpload(200,'{"id":"abc123_XX"}'),'https://www.youtube.com/watch?v=abc123_XX');
 assert.throws(()=>completedYouTubeUpload(308,'{}'),/might be resumable/);
 assert.throws(()=>completedYouTubeUpload(200,'{}'),/confirm a video ID/);
});
test('invalid titles, descriptions, privacy and sizes are rejected',()=>{
 assert.throws(()=>validateYouTubePost({...sample,title:''}));
 assert.throws(()=>validateYouTubePost({...sample,privacy:'worldwide'}));
 assert.throws(()=>validateYouTubePost({...sample,description:'z'.repeat(5001)}));
 assert.throws(()=>validateYouTubePost({...sample,size:0}));
});
