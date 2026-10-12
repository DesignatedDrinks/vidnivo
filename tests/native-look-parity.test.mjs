import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS,LOOK_ORDER } from '../src/domain/looks.ts';

const swift=readFileSync('modules/rollblink-export/ios/RollblinkExportModule.swift','utf8');
const kotlin=readFileSync('modules/rollblink-export/android/src/main/java/com/rollblink/export/RollblinkExportModule.kt','utf8');
function mapNative(text,pattern){
 const values=new Map();
 for(const match of text.matchAll(pattern)){
   values.set(match[1],{color:'#'+match[2],strength:Number(match[3])});
 }
 return values;
}
const swiftLooks=mapNative(swift,/"([a-z]+)":\(0x([0-9A-Fa-f]{6}),\s*(0?\.\d+)\)/g);
const androidLooks=mapNative(kotlin,/"([a-z]+)" to Pair\(0x([0-9A-Fa-f]{6}),\s*(0?\.\d+)\)/g);
test('every mobile preview tint has the identical colour and alpha in both native exporters',()=>{
 for(const platform of [swiftLooks,androidLooks]){
  assert.equal(platform.size,LOOK_ORDER.length-1,'Native render look map must have all presets');
  for(const preset of LOOK_ORDER.filter(x=>x!=='none')){
   const native=platform.get(preset);
   assert.ok(native,'missing native look '+preset);
   assert.equal(native.color.toUpperCase(),LOOKS[preset].color.toUpperCase());
   assert.equal(native.strength,LOOKS[preset].strength);
  }
 }
});
test('text overlays render above tint overlays on both platforms',()=>{
 assert.ok(swift.indexOf('root.addSublayer(tintLayer)')<swift.indexOf('request.texts.forEach'),
  'iOS captions must render above tint');
 assert.ok(kotlin.indexOf('BitmapOverlay.createStaticBitmapOverlay(bitmap)')<kotlin.indexOf('for (index in 0 until texts.length())'),
  'Android captions must render above tint');
});
