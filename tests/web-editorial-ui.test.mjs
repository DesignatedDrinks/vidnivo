import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const html=readFileSync('index.html','utf8');
const pages=readFileSync('docs/index.html','utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const body=html.match(/<body>([\s\S]*?)<script type="module">/)?.[1]||'';

test('video-first editor and published site are identical',()=>{
 assert.equal(pages,html,'Root and Pages HTML must remain identical');
 const viewer=body.indexOf('<div class="viewer">');
 const autopilot=body.indexOf('<section class="autopilot-card"');
 const timeline=body.indexOf('<div class="timeline-card">');
 assert.ok(viewer>=0&&autopilot>viewer&&timeline>autopilot,
  'Video must precede the compact finishing controls and timeline');
 assert.match(body,/<h1>Studio<span class="studio-dot">\.<\/span><\/h1>/);
 assert.match(body,/id="preview"/);
});
test('interface removes AI-marketing prose, microcopy and gratuitous status paragraphs',()=>{
 assert.doesNotMatch(body,/class="eyebrow"/);
 assert.doesNotMatch(body,/class="fine-print"/);
 assert.doesNotMatch(body,/class="tag"/);
 assert.doesNotMatch(body,/PRIVATE BETA|CREATOR WORKSPACE|ONE-TAP FILTERS|LIP SYNC · AUDIO SAFETY/);
 assert.doesNotMatch(body,/A real editor you can use in your browser|Finish the repetitive edits/);
 assert.match(body,/Make the cut\./);
 assert.match(body,/Auto-finish/);
 assert.match(body,/Your next great cut/);
});
test('all advanced and technical information remains user-accessible via collapsed disclosure',()=>{
 const details=[...body.matchAll(/<details\b/g)].length;
 assert.ok(details>=5,'One-tap preferences, edit safety, captions, retouch and export details');
 for(const text of ['Customize','Caption limits','Export requirements','About edits','About retouch'])
  assert.ok(body.includes('>'+text+'</summary>'),text);
 for(const id of ['creatorCaptions','creatorTighten','creatorVoice','autoCaptions',
  'captionText','captionFontSize','captionStart','captionEnd','faceRetouch',
  'watermarkEnabled','watermarkPosition','quality','export'])
  assert.ok(body.includes('id="'+id+'"'),'Working control missing: '+id);
 assert.match(body,/Local/);
});
test('responsive editorial skin uses restrained base surfaces, full video stage and real focus',()=>{
 assert.match(html,/\/\* Studio 2 — editorial dark\./);
 assert.match(html,/--bg:#090a0c/);
 assert.match(html,/\.preview-wrap\{height:clamp\(445px,61vh,690px\)/);
 assert.match(html,/\.autopilot-core\{display:grid/);
 assert.match(html,/@media\(max-width:770px\)/);
 assert.match(html,/@media\(max-width:385px\)/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/summary:focus-visible/);
});
test('simplification does not orphan buttons, inputs, caption gestures, motion or export',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length,'No duplicate controls');
 for(const ref of script.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(ids.includes(ref[1]),'Missing referenced UI element: '+ref[1]);
 const p=spawnSync(process.execPath,['--input-type=module','--check'],
  {input:script,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 for(const functionName of ['runCreatorAutopilot','runAutoCaptions','drawFrame',
  'startExport','setFaceRetouch','selectCaptionForEditing'])
  assert.ok(script.includes('function '+functionName+'('),'Function missing '+functionName);
 assert.match(script,/drawBrandWatermark\(ctx,state\.watermark\)/);
 assert.match(script,/canvas\.addEventListener\('pointermove'/);
 assert.match(script,/showProcessing\('export',2/);
});
