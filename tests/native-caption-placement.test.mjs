import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {applyCaptionPlacement} from '../src/domain/captionPlacement.ts';

const original={
 id:'project',revision:3,updatedAt:'2026-10-12T00:00:00Z',
 texts:[
  {id:'caption1',role:'caption',x:.5,y:.75,fontSize:28,text:'First words'},
  {id:'caption2',role:'caption',x:.5,y:.75,fontSize:32,text:'Second words'},
  {id:'title',role:'title',x:.4,y:.15,fontSize:44,text:'Opening hook'}
 ]
};
test('dragging one native subtitle moves the entire subtitle track, preserving titles',()=>{
 const next=applyCaptionPlacement(original,{x:.35,y:.62});
 assert.notEqual(next,original);
 assert.equal(next.revision,4);
 assert.equal(next.texts[0].x,.35);
 assert.equal(next.texts[1].x,.35);
 assert.equal(next.texts[0].y,.62);
 assert.equal(next.texts[1].y,.62);
 assert.deepEqual(next.texts[2],original.texts[2]);
 assert.equal(original.texts[0].y,.75);
});
test('pinch scaling applies one font size across subtitles',()=>{
 const next=applyCaptionPlacement(original,{x:.55,y:.7,fontSize:40});
 assert.equal(next.texts[0].fontSize,40);
 assert.equal(next.texts[1].fontSize,40);
 assert.equal(next.texts[2].fontSize,44);
});
test('out of frame drags clamp to safe bounds and no-op on invalid values',()=>{
 const next=applyCaptionPlacement(original,{x:500,y:-50,fontSize:999});
 assert.equal(next.texts[0].x,.9);
 assert.equal(next.texts[1].y,.12);
 assert.equal(next.texts[0].fontSize,90);
 assert.equal(applyCaptionPlacement(original,{x:NaN,y:.2}),original);
});
test('native editor keeps the main toolbar separate from caption context',()=>{
 const root=new URL('../',import.meta.url);
 const app=readFileSync(fileURLToPath(new URL('App.tsx',root)),'utf8');
 const stage=readFileSync(fileURLToPath(new URL('src/ui/VideoStage.tsx',root)),'utf8');
 assert.match(app,/captionQuickActions/);
 assert.match(app,/EditorRail actions=\{baseActions\}/);
 assert.match(app,/onCaptionPlacement/);
 assert.match(stage,/onResponderMove/);
 assert.match(stage,/onResponderRelease/);
});
