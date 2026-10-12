import test from 'node:test';
import assert from 'node:assert/strict';
import { addAsset, addText, createProject, removeClip, setProjectLook } from '../src/domain/timeline.ts';
import { loadRemoteProjects, saveProjectToSheets, softDeleteProjectFromSheets } from '../src/data/sheets.ts';

function fakeSheets() {
  const sheets = new Map(Object.entries({
    Projects: [['project_id','name','aspect_ratio','created_at','updated_at','revision','owner_email','deleted','look_json']],
    Assets: [['asset_id','project_id','kind','filename','uri','duration_ms','width','height','updated_at','deleted']],
    Clips: [['clip_id','project_id','asset_id','track','start_ms','in_ms','out_ms','speed','volume','muted','updated_at','deleted']],
    TextLayers: [['text_id','project_id','text','start_ms','end_ms','x','y','font_size','color','updated_at','deleted','role']]
  }));
  const requestLog = [];
  const fetchStub = async (url, opts = {}) => {
    const decoded = decodeURIComponent(url);
    requestLog.push({url: decoded, method: opts.method || 'GET'});
    const respond = json => ({ ok: true, status: 200, json: async () => json });
    const path = decoded.split('/values/')[1];
    if (opts.method === 'POST' && decoded.endsWith('/values:batchUpdate')) {
      const body = JSON.parse(opts.body);
      for (const item of body.data) {
        const [sheet, coordinate] = item.range.split('!');
        const firstCell = coordinate.split(':')[0];
        const m = /^([A-Z]+)([0-9]+)$/.exec(firstCell);
        assert.ok(m, 'valid A1 target');
        let column = 0;
        for (const char of m[1]) column = column * 26 + char.charCodeAt(0) - 64;
        const rowIndex = Number(m[2]) - 1, rows = sheets.get(sheet);
        for (let r = 0; r < item.values.length; r++) {
          while (rows.length <= rowIndex + r) rows.push([]);
          const dest = rows[rowIndex + r];
          item.values[r].forEach((val, i) => { dest[column - 1 + i] = String(val); });
        }
      }
      return respond({});
    }
    if (opts.method === 'POST' && decoded.includes(':append?')) {
      const sheet = path.split('!')[0];
      sheets.get(sheet).push(...JSON.parse(opts.body).values);
      return respond({});
    }
    if (!opts.method || opts.method === 'GET') {
      const sheet = path.split('!')[0];
      assert.ok(sheets.has(sheet), 'known table');
      return respond({ values: sheets.get(sheet) });
    }
    throw Error('Unexpected request: ' + decoded);
  };
  return {fetchStub, sheets, requestLog};
}
test('Google Sheets adapter saves normalized rows and round-trips project', async t => {
  const oldFetch = globalThis.fetch, fake = fakeSheets();
  globalThis.fetch = fake.fetchStub; t.after(() => { globalThis.fetch = oldFetch; });
  let p = createProject('Sheets demo');
  p = addAsset(p, {id:'media1',filename:'movie.mp4',uri:'file:///movie.mp4',durationMs:10000,width:1080,height:1920,kind:'video'});
  p = addText(p, 'Caption', 500, 4000);
  await saveProjectToSheets('fake-test-token',p);
  const stored = await loadRemoteProjects('fake-test-token');
  assert.equal(stored.length,1);
  assert.equal(stored[0].id,p.id);
  assert.equal(stored[0].clips[0].assetId, 'media1');
  assert.equal(stored[0].texts[0].text,'Caption');
  assert.equal(fake.sheets.get('Projects').length,2);
  assert.equal(fake.sheets.get('Assets').length,2);
  assert.equal(fake.sheets.get('Clips').length,2);
  assert.equal(fake.sheets.get('TextLayers').length,2);
  assert.ok(fake.requestLog.every(r => !r.url.includes('fake-test-token')), 'token never appears in request URLs');
  p=removeClip(p,p.clips[0].id);
  await saveProjectToSheets('fake-test-token',p);
  const after=await loadRemoteProjects('fake-test-token');
  assert.equal(after[0].clips.length,0);
  assert.equal(fake.sheets.get('Clips')[1].at(-1),'TRUE');
});
test('refuses cloud overwrite when stored revision is newer', async t => {
  const oldFetch=globalThis.fetch, fake=fakeSheets(); globalThis.fetch=fake.fetchStub;
  t.after(()=>{globalThis.fetch=oldFetch;});
  const p=createProject('Conflict');
  fake.sheets.get('Projects').push([p.id,p.name,'9:16',p.createdAt,p.updatedAt,'999','','FALSE']);
  await assert.rejects(()=>saveProjectToSheets('fake-test-token',p),/changed in Google Sheets/);
});

test('detects divergent same-revision cloud save', async t => {
 const oldFetch=globalThis.fetch, fake=fakeSheets(); globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 const p=createProject('Conflict');
 fake.sheets.get('Projects').push([p.id,p.name,'9:16',p.createdAt,'2030-01-01T00:00:00.000Z',String(p.revision),'','FALSE']);
 await assert.rejects(()=>saveProjectToSheets('fake-test-token',p),/changed in Google Sheets/);
});

test('soft delete marks all project rows and excludes project from cloud load', async t => {
 const oldFetch=globalThis.fetch, fake=fakeSheets();
 globalThis.fetch=fake.fetchStub; t.after(()=>{globalThis.fetch=oldFetch;});
 let p=createProject('Delete demo');
 p=addAsset(p,{id:'d1',kind:'video',uri:'file:///tmp/d1.mp4',filename:'d1',durationMs:5000,width:1920,height:1080});
 p=addText(p,'Test',0);
 await saveProjectToSheets('test',p);
 await softDeleteProjectFromSheets('test',p.id);
 assert.equal((await loadRemoteProjects('test')).length,0);
 for(const name of ['Projects','Assets','Clips','TextLayers']) {
   assert.equal(fake.sheets.get(name)[1][name === 'Projects' ? 7 : name === 'TextLayers' ? 10 : fake.sheets.get(name)[1].length - 1],'TRUE',name+' should be soft-deleted');
 }
});

test('look selection round trips in Google Sheets without hiding soft deleted projects', async t => {
 const oldFetch=globalThis.fetch, fake=fakeSheets();globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 let p=setProjectLook(createProject('Filter test'),'sunset',65);
 await saveProjectToSheets('test',p);
 const rows=await loadRemoteProjects('test');
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].look,{preset:'sunset',intensity:65});
 await softDeleteProjectFromSheets('test',p.id);
 assert.equal((await loadRemoteProjects('test')).length,0);
});

test('deleting an individual caption row leaves its role column untouched',async t=>{
 const oldFetch=globalThis.fetch,fake=fakeSheets();globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 let project=addText(createProject('Caption sync'),'A reusable title',0);
 const textId=project.texts[0].id;
 await saveProjectToSheets('token',project);
 project={...project,revision:project.revision+1,updatedAt:new Date(Date.now()+5000).toISOString(),texts:[]};
 await saveProjectToSheets('token',project);
 const row=fake.sheets.get('TextLayers').find(r=>r[0]===textId);
 assert.equal(row[10],'TRUE','the deleted column K must be set');
 assert.equal(row[11],'title','role column L must never be overwritten');
 assert.equal((await loadRemoteProjects('token'))[0].texts.length,0);
});
test('removing project row does not destroy look_json metadata',async t=>{
 const oldFetch=globalThis.fetch,fake=fakeSheets();globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 let project=setProjectLook(createProject('Preserve look'),'sunset',65);
 await saveProjectToSheets('token',project);
 await softDeleteProjectFromSheets('token',project.id);
 const row=fake.sheets.get('Projects')[1];
 assert.equal(row[7],'TRUE');
 assert.deepEqual(JSON.parse(row[8]),{preset:'sunset',intensity:65});
 await assert.rejects(()=>saveProjectToSheets('token',project),/deleted from Google Sheets/);
});
test('invalid cloud project is not silently dropped during import',async t=>{
 const oldFetch=globalThis.fetch,fake=fakeSheets();globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 let p=addAsset(createProject('Broken remote'),{id:'asset',filename:'a.mp4',kind:'video',durationMs:3000,width:1080,height:1920,uri:'file:///a.mp4'});
 await saveProjectToSheets('token',p);
 fake.sheets.get('Clips')[1][6]='-100';
 await assert.rejects(()=>loadRemoteProjects('token'),/invalid project/);
});
test('unexpected deleted header aborts writes without changing rows',async t=>{
 const oldFetch=globalThis.fetch,fake=fakeSheets();globalThis.fetch=fake.fetchStub;
 t.after(()=>{globalThis.fetch=oldFetch;});
 const p=createProject('Schema safety');
 fake.sheets.get('Projects')[0][7]='renamed';
 await assert.rejects(()=>saveProjectToSheets('token',p),/schema/);
 assert.equal(fake.sheets.get('Projects').length,1);
});
