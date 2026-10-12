import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/timeline.ts';
import {loadRemoteProjects} from '../src/data/sheets.ts';
test('Google Sheets load refuses full-range truncation rather than omitting additional projects',async t=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({values:Array.from({length:2000},()=>['x'])})});
 t.after(()=>{globalThis.fetch=old});
 await assert.rejects(()=>loadRemoteProjects('token'),/safe read limit/);
});
