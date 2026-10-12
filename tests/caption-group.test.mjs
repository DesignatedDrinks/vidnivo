import test from 'node:test';
import assert from 'node:assert/strict';
import {isSubtitleCaption,setSubtitleAnchor,subtitleSafeArea,clampSubtitleAnchor,captionLayout} from '../docs/rollblink-caption-touch.js';

const captions=()=>[
 {id:'1',text:'Short caption',start:0,end:2,origin:'auto',position:'bottom',fontScale:1},
 {id:'2',text:'A much longer subtitle with several words',start:2,end:4,origin:'auto',position:'top',fontScale:1},
 {id:'3',text:'Handwritten line',start:4,end:6,origin:'manual',position:'middle',fontScale:1},
 {id:'title',text:'Opening hook',start:0,end:2,origin:'opening-hook',position:'top',x:.5,y:.2,fontScale:1.2}
];
const ctx={font:'',measureText(t){return {width:String(t).length*9}}};

test('moving any subtitle moves every spoken caption to exact same anchor',()=>{
 const group=captions();
 assert.equal(isSubtitleCaption(group[3]),false);
 const pos=setSubtitleAnchor(group,{x:.38,y:.64});
 assert.deepEqual(pos,{x:.38,y:.64});
 assert.equal(group.filter(isSubtitleCaption).length,3);
 for(const cap of group.filter(isSubtitleCaption)){
  assert.equal(cap.position,'custom');
  assert.equal(cap.x,.38);assert.equal(cap.y,.64);
 }
 assert.equal(group[3].x,.5);
 assert.equal(group[3].y,.2);
});
test('shared bounds keep all caption centres aligned even with different lengths',()=>{
 const group=captions();
 const area=subtitleSafeArea(ctx,group,540,960);
 const anchor=clampSubtitleAnchor({x:.01,y:.98},area);
 setSubtitleAnchor(group,anchor);
 const positions=group.filter(isSubtitleCaption).map(cap=>{
  const layout=captionLayout(ctx,cap,540,960);
  return [layout.x,layout.y];
 });
 for(const position of positions)assert.deepEqual(position,positions[0]);
 assert.ok(area.minX>0);
 assert.ok(anchor.x>=area.minX);
 assert.ok(anchor.y<=area.maxY);
});
test('invalid anchor values are not accepted',()=>{
 assert.throws(()=>setSubtitleAnchor(captions(),{x:NaN,y:.5}));
});
