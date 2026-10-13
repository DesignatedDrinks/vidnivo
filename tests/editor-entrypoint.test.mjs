import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const src=new URL('../',import.meta.url);
const file=p=>readFileSync(fileURLToPath(new URL(p,src)),'utf8');
const root=file('index.html'),editor=file('docs/index.html');
const style=file('docs/rollblink-editor-shell.css');

test('repository-root entrypoint never runs obsolete video editor',()=>{
 assert.match(root,/location\.replace\(new URL\('\.\/docs\//);
 assert.doesNotMatch(root,/id="preview"/);
 assert.match(root,/v=20261012-mobilefirst/);
});
test('canonical editor includes the updated toolbar and all direct dependencies',()=>{
 for(const id of ['mobileBottomNav','mobileTimelineScroll','mobileCaptionTrack','mobileExport','rb-font']){
  assert.match(editor,new RegExp('id="'+id+'"'));
 }
 assert.match(editor,/rollblink-editor-shell\.css\?v=20261012-mobilefirst/);
 assert.match(editor,/rollblink-mobile-shell\.js\?v=20261012-mobilefirst/);
 for(const dep of ['docs/rollblink-mobile-shell.js','docs/rollblink-mobile-timeline.js',
  'docs/rollblink-caption-touch.js','docs/rollblink-creator-kit.js']){
  assert.ok(file(dep).length>100,'Required editor module missing: '+dep);
 }
});
test('desktop and mobile use the same editor rather than different legacy pages',()=>{
 assert.match(style,/mobile-first, one coherent layout system/);
 assert.match(style,/@media\\(min-width:700px\\)/);
 assert.match(style,/@media\(min-width:771px\)/);
 assert.match(style,/\.mobile-bottom-nav\{display:flex!important/);
 assert.match(style,/\.mobile-timeline-scroll\{display:block/);
});
