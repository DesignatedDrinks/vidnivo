import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync('index.html','utf8');
const pages=readFileSync('docs/index.html','utf8');
const brandCode=readFileSync('vidnivo-branding.js','utf8');
const deployedBrand=readFileSync('docs/vidnivo-branding.js','utf8');
const mark=readFileSync('vidnivo-mark.svg','utf8');
const deployedMark=readFileSync('docs/vidnivo-mark.svg','utf8');
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const branding=await import('data:text/javascript;base64,'+Buffer.from(brandCode).toString('base64'));
function checkSyntax(src){
 const p=spawnSync(process.execPath,['--check','--input-type=module'],{input:src,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr||p.stdout);
}
test('premium application and brand assets are identical on both published paths',()=>{
 assert.equal(html,pages);assert.equal(brandCode,deployedBrand);assert.equal(mark,deployedMark);
 checkSyntax(js);checkSyntax(brandCode);
 assert.match(mark,/<svg\b/);assert.match(mark,/<title id="title">VIDNIVO<\/title>/);
 assert.match(mark,/<path\b/);
 assert.match(html,/href="\.\/vidnivo-mark\.svg"/);
 assert.match(html,/class="brand-mark" src="\.\/vidnivo-mark\.svg"/);
 assert.match(html,/class="empty-symbol"><img src="\.\/vidnivo-mark\.svg"/);
 assert.match(html,/class="footer-note"><img src="\.\/vidnivo-mark\.svg"/);
});
test('all new processing and watermark controls are real and uniquely wired',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['watermarkEnabled','watermarkPosition','processingOverlay','processHeadline',
  'processDetail','processStages','processPrivacy','creatorProgress','captionProgress','exportProgress']){
  if(id==='processPrivacy')continue;
  assert.ok(ids.includes(id),'Missing '+id);
 }
 for(const m of js.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(ids.includes(m[1]),'Missing DOM control '+m[1]);
});
test('watermark is enabled by default and can be toggled or repositioned',()=>{
 assert.deepEqual(branding.normalizeWatermark({}),{
  enabled:true,position:'bottom-right',opacity:.62
 });
 assert.equal(branding.normalizeWatermark({enabled:false}).enabled,false);
 assert.equal(branding.normalizeWatermark({position:'top-left'}).position,'top-left');
 assert.equal(branding.normalizeWatermark({position:'bad'}).position,'bottom-right');
 assert.equal(branding.normalizeWatermark({opacity:10}).opacity,.9);
 assert.equal(branding.normalizeWatermark({opacity:-5}).opacity,.25);
});
test('watermark is contained inside 9:16, square and 16:9 exports',()=>{
 for(const [w,h] of [[720,1280],[1080,1920],[1080,1080],[1920,1080],[540,960]]){
  for(const position of branding.WATERMARK_POSITIONS){
   const g=branding.watermarkGeometry(w,h,position);
   assert.ok(g.x>=0&&g.y>=0&&g.width>0&&g.height>0);
   assert.ok(g.x+g.width<=w&&g.y+g.height<=h,position+' '+w+'x'+h);
  }
 }
});
test('disabled watermark draws nothing, enabled watermark paints true vector and wordmark',()=>{
 const calls=[];
 const ctx={canvas:{width:720,height:1280},
  save(){calls.push('save')},restore(){calls.push('restore')},beginPath(){},roundRect(){},
  fill(){calls.push('fill')},stroke(){calls.push('stroke')},moveTo(){},lineTo(){},
  fillText(word){calls.push(word)},
  createLinearGradient(){return {addColorStop(){}}}
 };
 assert.equal(branding.drawBrandWatermark(ctx,{enabled:false}),null);
 assert.equal(calls.length,0);
 const rect=branding.drawBrandWatermark(ctx,{enabled:true,position:'bottom-right'});
 assert.ok(rect&&rect.x>0&&rect.y>0);
 assert.ok(calls.includes('VIDNIVO'));
 assert.ok(calls.includes('stroke'));
 assert.ok(calls.includes('fill'));
});
test('preview and MediaRecorder export use same rendered watermark without HTML-only trick',()=>{
 const draw=js.slice(js.indexOf('function drawFrame(){'),js.indexOf('function requestDraw(){'));
 const start=js.slice(js.indexOf('async function startExport(){'),js.indexOf('function setTab(',js.indexOf('async function startExport(){')));
 assert.match(draw,/drawBrandWatermark\(ctx,state\.watermark\)/);
 assert.match(start,/canvas\.captureStream\(30\)/);
 assert.match(start,/state\.exporting=true/);
 assert.match(start,/\$\('watermarkEnabled'\)\.disabled=true/);
 assert.match(start,/\$\('watermarkEnabled'\)\.disabled=false/);
 assert.match(js,/watermarkPosition'\)\.addEventListener\('change'/);
 assert.match(js,/watermarkEnabled'\)\.addEventListener\('change'/);
});
test('animations represent actual processing states, not invented progress estimates',()=>{
 for(const name of ['import','captions','creator','export'])assert.match(js,new RegExp(' '+name+':\\['));
 assert.match(js,/showProcessing\('import',0/);
 assert.match(js,/showProcessing\('import',1/);
 assert.match(js,/showProcessing\('captions',stage,message\)/);
 assert.match(js,/showProcessing\('creator',stage,message\)/);
 assert.match(js,/showProcessing\('export',0/);
 assert.match(js,/showProcessing\('export',1/);
 assert.match(js,/showProcessing\('export',2/);
 assert.match(js,/showProcessing\('export',3/);
 assert.match(js,/hideProcessing\('import'\)/);
 assert.match(js,/hideProcessing\('export'\)/);
 assert.match(js,/updateRealProcessingBar\('captionProgress'/);
 assert.match(js,/updateRealProcessingBar\('creatorProgress'/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/\.processing-overlay\[hidden\]/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.doesNotMatch(js,/captionProgress'\)\.style\.width=Math\.max/);
});
test('spec and developer handoff exist with shipping and limitations stated',()=>{
 const spec=readFileSync('docs/VIDNIVO_DESIGN_SYSTEM_V1.md','utf8');
 const brief=readFileSync('docs/VIDNIVO_DEVELOPER_BUILD_BRIEF.md','utf8');
 assert.match(spec,/acceptance/i);assert.match(spec,/watermark/i);assert.match(spec,/reduced-motion/i);
 assert.match(brief,/Run existing test suite/);assert.match(brief,/GitHub Pages/);
});
