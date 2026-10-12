import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const html=readFileSync('index.html','utf8');
const mirror=readFileSync('docs/index.html','utf8');
const src=readFileSync('rollblink-face-retouch.js','utf8');
const deployed=readFileSync('docs/rollblink-face-retouch.js','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';

function checkSyntax(text){
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:text,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}

test('both web hosting entrypoints deliver identical retouch-capable editor',()=>{
 assert.equal(html,mirror);
 assert.equal(src,deployed);
 assert.match(html,/id="faceRetouch"/);
 assert.match(html,/id="faceRetouchStatus"/);
 assert.match(html,/id="faceRetouchPreset"/);
 assert.match(script,/import \{FaceRetouch\} from '\.\/rollblink-face-retouch\.js\?v=5'/);
 assert.match(script,/faceTracker\.draw\(ctx,video/);
 assert.match(script,/state\.faceRetouch=0/);
 assert.match(script,/faceTracker\.reset\(\)/);
 assert.match(script,/if\(state\.faceRetouch>0&&!faceTracker\.supported\)/);
});
test('standalone face and editor scripts parse and reference real controls',()=>{
 checkSyntax(src);checkSyntax(script);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const match of script.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(ids.includes(match[1]),'Missing element: '+match[1]);
});
test('face geometry validation rejects absent or invalid tracking data',async()=>{
 const mod=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const face=new Array(478).fill(null).map(()=>({x:.5,y:.5,z:0}));
 assert.equal(mod.validateFaceMesh(face),true);
 assert.equal(mod.validateFaceMesh(null),false);
 assert.equal(mod.validateFaceMesh([]),false);
 assert.equal(mod.validateFaceMesh(face.slice(0,200)),false);
 assert.equal(mod.faceBounds(face),null,'Collapsed face must never draw');
 // Valid face outline can surround an image-centred facial region.
 const values=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 for(let i=0;i<values.length;i++){
  const angle=2*Math.PI*i/values.length;
  face[values[i]]={x:.5+.12*Math.cos(angle),y:.5+.18*Math.sin(angle)};
 }
 const bounds=mod.faceBounds(face);
 assert.ok(bounds?.w>.2&&bounds?.h>.3);
 face[10]={x:NaN,y:.3};assert.equal(mod.faceBounds(face),null);
});
test('the effect masks eye, eyebrow and lip regions; never blurs entire video',()=>{
 assert.match(src,/const EYES=\[/);
 assert.match(src,/const BROWS=\[/);
 assert.match(src,/const MOUTH=\[/);
 assert.match(src,/destination-out/);
 assert.match(src,/for\(const eye of EYES\)eraseFeatures/);
 assert.match(src,/for\(const brow of BROWS\)eraseFeatures/);
 assert.match(src,/eraseFeatures\(mask,mesh,MOUTH/);
 assert.match(src,/if\(!this\.meshes\.length\)return false/);
 assert.match(src,/if\(!amount\|\|!this\.landmarker\)return false/);
});
test('tracker keeps footage local and treats library/model failures as disable-not-silent',()=>{
 assert.match(src,/FaceLandmarker\.createFromOptions/);
 assert.match(src,/detectForVideo\(video,now\)/);
 assert.match(src,/numFaces:1/);
 assert.match(src,/if\(now-this\.lastScan<165/);
 assert.doesNotMatch(src,/fetch\(/);
 assert.match(script,/state\.faceRetouch=0/);
 assert.match(script,/Could not start on-device face tracking/);
});

test('face tracker uses a published package release, fallback CDN, and retries safely',()=>{
 assert.match(src,/MEDIAPIPE_VERSION='0\.10\.21'/);
 assert.doesNotMatch(src,/@mediapipe\/tasks-vision@0\.10\.22(?!-rc)/);
 assert.match(src,/cdn\.jsdelivr\.net\/npm\/\@mediapipe/);
 assert.match(src,/unpkg\.com\/\@mediapipe/);
 assert.match(src,/for\(const \[index,host\] of ASSET_HOSTS\.entries\(\)\)/);
 assert.match(src,/await import\(host\+'\/vision_bundle\.mjs'\)/);
 assert.match(src,/FilesetResolver\.forVisionTasks\(host\+'\/wasm'\)/);
 assert.match(src,/this\.landmarker=null/);
 assert.match(src,/this\.loading=null/);
 assert.match(src,/Check your internet connection or Safari content blockers/);
});
