import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
test('ROLLBLINK brand appears across both published video editors',()=>{
 const html=read('index.html'),site=read('docs/index.html');
 assert.equal(html,site);
 assert.match(html,/<title>ROLLBLINK Studio/);
 assert.match(html,/<span>ROLL<\/span><span class="brand-accent">BLINK<\/span>/);
 assert.match(html,/\.\/rollblink-mark\.svg/);
 assert.match(html,/rollblink-(filters|autopilot|face-retouch|branding|caption-touch|export-sync)\.js/);
 assert.doesNotMatch(html,/VIDNIVO|Vidnivo|VIDNI<|vidnivo-(branding|filters)\.js/);
});
test('favicon mark is an R monogram, not old V; watermark exports brand',()=>{
 const a=read('rollblink-mark.svg'),b=read('docs/rollblink-mark.svg');
 assert.equal(a,b);
 assert.match(a,/<title id="title">ROLLBLINK<\/title>/);
 assert.match(a,/A geometric R mark/);
 assert.match(read('rollblink-branding.js'),/fillText\('ROLLBLINK'/);
 assert.equal(read('rollblink-branding.js'),read('docs/rollblink-branding.js'));
});
test('native application and exporter identifiers agree',()=>{
 const expo=JSON.parse(read('app.json')).expo;
 assert.equal(expo.name,'ROLLBLINK');
 assert.equal(expo.slug,'rollblink');
 assert.equal(expo.scheme,'rollblink');
 assert.equal(expo.ios.bundleIdentifier,'com.rollblink.editor');
 assert.equal(expo.android.package,'com.rollblink.editor');
 assert.ok(existsSync('modules/rollblink-export/ios/RollblinkExportModule.swift'));
 assert.ok(existsSync('modules/rollblink-export/android/src/main/java/com/rollblink/export/RollblinkExportModule.kt'));
 assert.match(read('src/export/native.ts'),/RollblinkExport/);
 assert.match(read('src/media/speech.ts'),/RollblinkSpeech/);
 assert.match(read('modules/rollblink-export/expo-module.config.json'),/RollblinkExportModule/);
});
test('legacy project storage and secrets survive rebrand',()=>{
 const storage=read('src/data/storageCore.ts');
 assert.match(storage,/@vidnivo\/projects\/v1/);
 assert.match(storage,/@vidnivo\/projects\/last-good\/v1/);
 const secret=read('src/social/secrets.ts');
 assert.match(secret,/vidnivo\.openai\.key\.v1/);
 const js=read('rollblink-autopilot.js');
 assert.match(js,/rollblink:creator-style:v1/);
 assert.match(js,/getItem\('vidnivo:creator-style:v1'\)/);
});
test('new file layout matches cloud config while preserving existing infrastructure endpoints',()=>{
 assert.match(read('web/src/main.js'),/ROLLBLINK/);
 assert.match(read('web/package.json'),/rollblink-web/);
 assert.match(read('firebase.json'),/"serviceId": "vidnivo-api"/);
 assert.match(read('.github/workflows/cloud-foundation-deploy.yml'),/gcloud run deploy vidnivo-api/);
 assert.ok(existsSync('docs/ROLLBLINK_DESIGN_SYSTEM_V1.md'));
 assert.ok(existsSync('docs/ROLLBLINK_DEVELOPER_BUILD_BRIEF.md'));
});
