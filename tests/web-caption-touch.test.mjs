import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const html=readFileSync('docs/index.html','utf8');
const pages=readFileSync('index.html','utf8');
const module=readFileSync('rollblink-caption-touch.js','utf8');
const pagesModule=readFileSync('docs/rollblink-caption-touch.js','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const layout=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
function checkSyntax(source){
 const r=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
}
function fakeCanvas(){
 return {font:'',measureText(text){
  const size=Number(this.font.match(/([0-9.]+)px/)?.[1]||24);
  return {width:size*.56*text.length};
 }};
}
test('browser pages ship the exact same caption gesture code',()=>{
 assert.match(pages,/docs\/\?/);
 assert.equal(pagesModule,module);
 checkSyntax(script);checkSyntax(module);
 assert.match(script,/canvas\.addEventListener\('pointerdown'/);
 assert.match(script,/canvas\.addEventListener\('pointermove'/);
 assert.match(script,/canvas\.addEventListener\('pointerup'/);
 assert.match(script,/canvas\.addEventListener\('pointercancel'/);
 assert.match(script,/canvas\.setPointerCapture\(event\.pointerId\)/);
 assert.match(script,/touchPointers\.set\(event\.pointerId,point\)/);
 assert.match(script,/startOneFingerDrag\(cap,point\)/);
 assert.match(script,/startTwoFingerPinch\(cap\)/);
 assert.match(script,/gestureDistance\(points\[0\],points\[1\]\)/);
 assert.match(script,/cap\.fontScale=value/);
 assert.match(script,/cap\.position='custom'/);
});
test('all size and positioning controls are present, with no DOM id collisions',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['captionFontSize','captionFontSizeLabel','captionSmaller','captionLarger','captionCenter','captionTouchStatus'])
  assert.ok(ids.includes(id),id);
 for(const match of script.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(ids.includes(match[1]),match[1]);
});
test('legacy captions preserve their original positions and 100% size',()=>{
 assert.deepEqual(layout.captionAnchor({position:'top'}),{x:.5,y:.17});
 assert.deepEqual(layout.captionAnchor({position:'middle'}),{x:.5,y:.53});
 assert.deepEqual(layout.captionAnchor({position:'bottom'}),{x:.5,y:.8});
 assert.equal(layout.fontScale(undefined),1);
 assert.equal(layout.fontScale(100),2.4);
 assert.equal(layout.fontScale(-10),.55);
 assert.equal(layout.fontScale(1.2),1.2);
});
test('dragging uses normalized coordinates and clamps captions inside the frame',()=>{
 const canvas=fakeCanvas();
 const cap={id:'one',text:'Preview position',x:.1,y:.15,fontScale:1.3};
 const box=layout.captionLayout(canvas,cap,540,960);
 assert.ok(box.bounds.left>=0&&box.bounds.top>=0);
 assert.ok(box.bounds.right<=540&&box.bounds.bottom<=960);
 const pos=layout.clampedCaptionAnchor(-100,-100,box,540,960);
 assert.ok(pos.x>0&&pos.y>0);
 const opposite=layout.clampedCaptionAnchor(2000,2000,box,540,960);
 assert.ok(opposite.x<1&&opposite.y<1);
 const restored=layout.captionLayout(canvas,{...cap,...opposite},1080,1920);
 assert.ok(restored.x/1080>.5&&restored.y/1920>.5);
 assert.ok(restored.bounds.right<=1080&&restored.bounds.bottom<=1920);
});
test('pinch math supports enlargement and reduction without jumps',()=>{
 const a={x:100,y:100},b={x:200,y:100},c={x:300,y:100};
 assert.equal(layout.gestureDistance(a,b),100);
 assert.equal(layout.gestureDistance(a,c),200);
 assert.equal(layout.fontScale(1*layout.gestureDistance(a,c)/layout.gestureDistance(a,b)),2);
 assert.equal(layout.fontScale(1*layout.gestureDistance(a,{x:150,y:100})/100),.55);
 assert.deepEqual(layout.midpoint(a,c),{x:200,y:100});
});
test('hit-testing selects only a visible caption and uses a finger-sized minimum target',()=>{
 const box={left:100,right:220,top:350,bottom:390,width:120,height:40};
 assert.equal(layout.pointInCaption({x:130,y:370},box),true);
 assert.equal(layout.pointInCaption({x:400,y:370},box),false);
 const tiny={left:100,right:110,top:100,bottom:110,width:10,height:10};
 assert.equal(layout.pointInCaption({x:95,y:105},tiny,44),true);
});
test('exports render saved caption size/location but no touch selection handles',()=>{
 const from=script.indexOf('function drawFrame(');
 const to=script.indexOf('function requestDraw(){',from);
 const render=script.slice(from,to);
 assert.match(render,/const layout=captionLayout\(ctx,\{\.\.\.cap,fontId:/);
 assert.match(render,/const \{x,y,size,leading,lines,bounds\}=layout/);
 assert.match(render,/ctx\.fillText\(line,x,yy\)/);
 assert.match(render,/!state\.exporting&&state\.editCaptionId===cap\.id/);
 assert.match(script,/fontScale:fontScale\(Number\(\$\('captionFontSize'\)\.value\)\/100\)/);
 assert.match(script,/delete target\.x;delete target\.y/);
});
