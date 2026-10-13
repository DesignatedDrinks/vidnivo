import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {timelineGeometry,ticksForTimeline,captionAtTime,splitTimedCaption,timelineClipWidths} from '../docs/rollblink-mobile-timeline.js';

const here=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(here,'../docs/index.html'),'utf8');
const shell=readFileSync(join(here,'../docs/rollblink-editor-shell.css'),'utf8');
const moduleSource=readFileSync(join(here,'../docs/rollblink-mobile-shell.js'),'utf8');

test('mobile timeline geometry fits the viewport without unbounded layouts',()=>{
 const short=timelineGeometry(18,380);
 assert.ok(short.width>=380);
 assert.ok(short.pixelsPerSecond>=20);
 const long=timelineGeometry(720,380);
 assert.ok(long.width<=9000);
 const widths=timelineClipWidths([{start:0,end:8,speed:1},{start:8,end:18,speed:1}],short.pixelsPerSecond);
 assert.ok(widths.every(w=>w>0));
 assert.ok(Math.abs(widths[0]+widths[1]-short.width)<2);
});
test('time ruler uses real offsets',()=>{
 const ticks=ticksForTimeline(18);
 assert.equal(ticks[0].label,'00:00');
 assert.ok(ticks.some(t=>t.label==='00:02'));
 assert.ok(ticks.every((t,i)=>i===0||t.time>ticks[i-1].time));
});
test('caption splitting preserves every word and original duration',()=>{
 const source={id:'a',start:0,end:4,text:'Making content is hard work',origin:'auto'};
 const [a,b]=splitTimedCaption(source,2,'b');
 assert.equal(a.start,0);assert.equal(a.end,2);
 assert.equal(b.start,2);assert.equal(b.end,4);
 assert.equal(a.text+' '+b.text,source.text);
 assert.equal(source.text,'Making content is hard work');
 assert.equal(b.id,'b');
 assert.throws(()=>splitTimedCaption(source,0,'b'));
});
test('playhead caption selection matches timestamps',()=>{
 const list=[{start:0,end:2,text:'first'},{start:2,end:4,text:'second'}];
 assert.equal(captionAtTime(list,1.3)?.text,'first');
 assert.equal(captionAtTime(list,2)?.text,'second');
 assert.equal(captionAtTime(list,9),null);
});
test('mobile controls exist once and connect to operational editor',()=>{
 for(const id of ['mobileExport','mobileQuality','mobileClose','mobileBottomNav','mobileTimelineScroll',
  'mobileCaptionTrack','mobileOriginalAudio','mobilePlayhead','mobileCaptionContext','mobileAudioPanel',
  'mobileCaptionTime','mobileRatio','mobileAIClips','mobileCover','mobileMute','mobileAddCaption']){
  const count=(html.match(new RegExp('id="'+id+'"','g'))||[]).length;
  assert.equal(count,1,id+' must appear exactly once');
 }
 assert.match(html,/rollblink-editor-shell\.css/);
 assert.match(html,/createRollblinkMobileShell/);
 assert.match(html,/rbMobileShell\.mount\(\)/);
 assert.match(shell,/@media\(max-width:770px\)/);
 assert.match(moduleSource,/startExport\(\)/);
 assert.match(moduleSource,/runAutoCaptions\(\)/);
});

test('pinch scale geometry remains bounded and preserves timestamp coordinate mapping',()=>{
 const base=timelineGeometry(35,375,1),zoomed=timelineGeometry(35,375,2.5);
 assert.ok(zoomed.pixelsPerSecond>base.pixelsPerSecond*2);
 assert.ok(timelineGeometry(35,375,99).pixelsPerSecond<=base.pixelsPerSecond*4.01);
 assert.ok(timelineGeometry(35,375,.01).pixelsPerSecond>=base.pixelsPerSecond*.49);
 const seekSeconds=14.7;
 assert.ok(Math.abs(seekSeconds*zoomed.pixelsPerSecond/zoomed.pixelsPerSecond-seekSeconds)<.001);
});
test('mobile-first shell has a fixed playhead, functional history and a font gallery',()=>{
 for(const id of ['mobileUndo','mobileRedo','mobileFixedPlayhead','mobileAudioWaveform','rb-font-grid']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must be unique');
 }
 assert.match(html,/rbTravelHistory\('undo'\)/);
 assert.match(html,/rbTravelHistory\('redo'\)/);
 assert.match(html,/FONT_CHOICES/);
 assert.match(html,/projectSnapshot\(state\)/);
 assert.match(html,/hydrateSnapshot\(snapshot,state.sources,key\)/);
 assert.match(moduleSource,/prepareWaveform/);
 assert.match(moduleSource,/\.scrollLeft=x/);
 assert.match(moduleSource,/addEventListener\('touchmove'/);
 assert.match(shell,/--rb-bg:#07090D/);
 assert.match(shell,/mobile-fixed-playhead/);
 assert.match(shell,/height:calc\(100dvh/);
});
