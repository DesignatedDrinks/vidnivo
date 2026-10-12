import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(f,'utf8');
test('hosted page is honest about development status and never shows fake sign-up',()=>{
 const html=read('web/index.html');
 assert.match(html,/IN DEVELOPMENT/);
 assert.match(html,/No public mobile app, web editor, or paid access/);
 assert.doesNotMatch(html,/fetch\(/);
});
test('Firebase Hosting responses contain basic security headers',()=>{
 const h=JSON.parse(read('firebase.json')).hosting.headers[0].headers;
 const names=new Set(h.map(v=>v.key));
 for(const k of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy'])
  assert.ok(names.has(k),k);
});
