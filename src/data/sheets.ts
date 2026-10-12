import type { Asset, Clip, Project, TextLayer } from '../domain/timeline.ts';
import { validateProject } from '../domain/timeline.ts';
import { resolveLook, parseLook } from '../domain/looks.ts';

/**
 * Google Sheets is the remote database. Media bytes remain on the phone.
 * Access is OAuth user-authorized; never embed a service-account key in an app.
 * Row 1 contains schema headers. Calls are intentionally manual, not per edit.
 */
export const SHEET_ID = '1MclQpsLuNcq4hv28m-UByxImcqLcv1BqO3vcMsIWfYM';
type Table = 'Projects' | 'Assets' | 'Clips' | 'TextLayers';
type Rows = string[][];
const ROOT = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;
const address = (sheet: Table, range: string) => `${ROOT}/${encodeURIComponent(sheet + '!' + range)}`;
const value = (v: unknown) => v === null || v === undefined ? '' : String(v);
async function api(token: string, url: string, init?: RequestInit): Promise<any> {
  if (!token) throw new Error('Sign in to Google before syncing');
  const response = await fetch(url, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Google Sheets HTTP ${response.status}`);
  return body;
}
async function readTable(token: string, sheet: Table): Promise<Rows> {
  const result = await api(token, address(sheet, 'A1:L2000'));
  return (result.values ?? []) as Rows;
}
async function batchWrite(token: string, entries: { range: string; values: string[][] }[]): Promise<void> {
  if (!entries.length) return;
  await api(token, `${ROOT}:batchUpdate`, {
    method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: entries })
  });
}
async function appendRows(token: string, sheet: Table, rows: Rows): Promise<void> {
  if (!rows.length) return;
  await api(token, `${address(sheet, 'A:L')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: rows })
  });
}
const toProject = (p: Project): string[] => [
  p.id, p.name, p.aspectRatio, p.createdAt, p.updatedAt, value(p.revision), '', 'FALSE', JSON.stringify(resolveLook(p.look))
];
const toAsset = (p: Project, a: Asset): string[] => [
  a.id, p.id, a.kind, a.filename, a.uri, value(a.durationMs), value(a.width), value(a.height), p.updatedAt, 'FALSE'
];
const toClip = (p: Project, c: Clip): string[] => [
  c.id, p.id, c.assetId, c.track, value(c.startMs), value(c.inMs),
  value(c.outMs), value(c.speed), value(c.volume), value(c.muted), p.updatedAt, 'FALSE'
];
const toText = (p: Project, t: TextLayer): string[] => [
  t.id, p.id, t.text, value(t.startMs), value(t.endMs), value(t.x),
  value(t.y), value(t.fontSize), t.color, p.updatedAt, 'FALSE', value(t.role ?? 'caption')
];
function enabled(row: string[], sheet: Table): boolean { return String(row[sheet === 'Projects' ? 7 : sheet === 'TextLayers' ? 10 : row.length - 1]).toUpperCase() !== 'TRUE'; }
function n(row: string[], index: number, fallback = 0): number {
  const v = Number(row[index]); return Number.isFinite(v) ? v : fallback;
}
function parsedProject(row: string[]): Project {
  return { id: row[0], name: row[1] || 'Untitled', aspectRatio: row[2] === '1:1' || row[2] === '16:9' ? row[2] : '9:16',
    createdAt: row[3] || '', updatedAt: row[4] || '', revision: n(row, 5, 1),
    assets: [], clips: [], texts: [], look: parseLook(row[8]) };
}
export async function loadRemoteProjects(token: string): Promise<Project[]> {
  const [ps, as, cs, ts] = await Promise.all([
    readTable(token, 'Projects'), readTable(token, 'Assets'),
    readTable(token, 'Clips'), readTable(token, 'TextLayers')
  ]);
  const projects = ps.slice(1).filter(r => r[0] && enabled(r, 'Projects')).map(parsedProject);
  const indexed = new Map(projects.map(p => [p.id, p]));
  for (const r of as.slice(1)) {
    const p = indexed.get(r[1]); if (!p || !r[0] || !enabled(r, 'Assets')) continue;
    p.assets.push({ id: r[0], kind: r[2] === 'audio' || r[2] === 'image' ? r[2] : 'video',
      filename: r[3] || '', uri: r[4] || '', durationMs: n(r, 5), width: n(r, 6), height: n(r, 7) });
  }
  for (const r of cs.slice(1)) {
    const p = indexed.get(r[1]); if (!p || !r[0] || !enabled(r, 'Clips')) continue;
    p.clips.push({ id: r[0], assetId: r[2], track: r[3] === 'audio' ? 'audio' : 'video',
      startMs: n(r, 4), inMs: n(r, 5), outMs: n(r, 6), speed: n(r, 7, 1),
      volume: n(r, 8, 1), muted: String(r[9]).toLowerCase() === 'true' });
  }
  for (const r of ts.slice(1)) {
    const p = indexed.get(r[1]); if (!p || !r[0] || !enabled(r, 'TextLayers')) continue;
    p.texts.push({ id: r[0], text: r[2] || '', startMs: n(r, 3), endMs: n(r, 4),
      x: n(r, 5, .5), y: n(r, 6, .75), fontSize: n(r, 7, 32), color: r[8] || '#FFFFFF', role: r[11] === 'title' ? 'title' : 'caption' });
  }
  return projects.filter(p => { try { validateProject(p); return true; } catch { return false; } });
}
async function upsert(token: string, sheet: Table, projectId: string, desired: Rows): Promise<void> {
  const rows = await readTable(token, sheet), width = rows[0]?.length || desired[0]?.length || 8;
  const own = new Map<string, number>();
  rows.slice(1).forEach((r, idx) => {
    const projectColumn = sheet === 'Projects' ? 0 : 1;
    if (r[projectColumn] === projectId && r[0]) own.set(r[0], idx + 2);
  });
  const current = new Set(desired.map(r => r[0]));
  const updates: { range: string; values: string[][] }[] = [];
  const added: Rows = [];
  for (const row of desired) {
    const index = own.get(row[0]);
    if (index !== undefined) updates.push({ range: `${sheet}!A${index}:${columnName(row.length)}${index}`, values: [row] });
    else added.push(row);
  }
  for (const [key, index] of own) {
    if (!current.has(key)) {
      const col = columnName(width);
      updates.push({ range: `${sheet}!${col}${index}`, values: [['TRUE']] });
    }
  }
  await batchWrite(token, updates);
  await appendRows(token, sheet, added);
}
function columnName(index: number): string {
  let n = index, col = '';
  while (n > 0) { n--; col = String.fromCharCode(65 + n % 26) + col; n = Math.floor(n / 26); }
  return col;
}
export async function saveProjectToSheets(token: string, p: Project): Promise<void> {
  validateProject(p);
  const existing = await readTable(token, 'Projects');
  const remote = existing.slice(1).find(r => r[0] === p.id && enabled(r, 'Projects'));
  if (remote && (n(remote, 5) > p.revision ||
    (n(remote, 5) === p.revision && remote[4] !== p.updatedAt))) {
    throw new Error('This project changed in Google Sheets. Import the newer version before saving to avoid overwriting edits.');
  }
  await upsert(token, 'Assets', p.id, p.assets.map(a => toAsset(p, a)));
  await upsert(token, 'Clips', p.id, p.clips.map(c => toClip(p, c)));
  await upsert(token, 'TextLayers', p.id, p.texts.map(t => toText(p, t)));
  await upsert(token, 'Projects', p.id, [toProject(p)]);
}

/**
 * Soft-delete a project and all its related rows so a cloud pull doesn't
 * resurrect the deleted project. Media remains on-device; no physical file
 * deletion occurs. This is not an account erasure endpoint.
 */
export async function softDeleteProjectFromSheets(token: string, projectId: string): Promise<void> {
  if (!projectId) throw new Error('Missing project ID');
  const tabs: Table[] = ['Projects', 'Assets', 'Clips', 'TextLayers'];
  const all = await Promise.all(tabs.map(tab => readTable(token, tab)));
  const changes: { range: string; values: string[][] }[] = [];
  tabs.forEach((tab, idx) => {
    const rows = all[idx];
    const parentColumn = tab === 'Projects' ? 0 : 1;
    const deletedColumn = rows[0]?.indexOf('deleted') ?? -1;
    if (deletedColumn < 0) throw new Error('Missing deleted column on ' + tab);
    rows.slice(1).forEach((row, n) => {
      if (row[parentColumn] === projectId && row[0] && String(row[deletedColumn]).toUpperCase() !== 'TRUE') {
        changes.push({ range: tab + '!' + columnName(deletedColumn + 1) + (n + 2), values: [['TRUE']] });
      }
    });
  });
  await batchWrite(token, changes);
}
