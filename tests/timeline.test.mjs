import test from 'node:test';
import assert from 'node:assert/strict';
import { activeClip, addAsset, addText, clipDurationMs, createProject, durationMs, editClip, moveClip, removeClip, reorderClip, splitClip, trimClip, validateProject } from '../src/domain/timeline.ts';
const media = (id, duration = 6000) => ({ id, kind: 'video', uri: `file:///example/${id}.mp4`, filename: id, durationMs: duration, width: 1080, height: 1920 });
test('new project validates', () => {
  const p = createProject('Test'); validateProject(p);
  assert.equal(p.name, 'Test'); assert.equal(durationMs(p), 0);
});
test('media is appended in sequence on video track', () => {
  let p = createProject(); p = addAsset(p, media('a')); p = addAsset(p, media('b', 4000));
  assert.equal(p.clips.length, 2); assert.equal(p.clips[1].startMs, 6000);
  assert.equal(durationMs(p), 10000); assert.equal(activeClip(p, 6001)?.assetId, 'b');
});
test('splitting preserves project length and asset reference', () => {
  let p = addAsset(createProject(), media('a'));
  const id = p.clips[0].id; p = splitClip(p, id, 2500);
  assert.equal(p.clips.length, 2); assert.equal(clipDurationMs(p.clips[0]), 2500);
  assert.equal(p.clips[1].inMs, 2500); assert.equal(p.clips[1].startMs, 2500);
  assert.equal(durationMs(p), 6000);
  p = splitClip(p, id, 50); assert.equal(p.clips.length, 2);
});
test('trims obey minimum duration and source boundaries', () => {
  let p = addAsset(createProject(), media('a'));
  const id = p.clips[0].id;
  p = trimClip(p, id, 'right', -1500);
  assert.equal(p.clips[0].outMs, 4500);
  p = trimClip(p, id, 'left', 500);
  assert.equal(p.clips[0].inMs, 500); assert.equal(p.clips[0].startMs, 500);
  p = trimClip(p, id, 'right', -100000);
  assert.equal(p.clips[0].outMs, 750);
  validateProject(p);
});
test('move, speed, reorder and removal are pure immutable operations', () => {
  let p = addAsset(addAsset(createProject(), media('a')), media('b'));
  const original = p;
  const a = p.clips[0].id;
  p = moveClip(p, a, 2000); assert.equal(p.clips[0].startMs, 2000);
  p = editClip(p, a, { speed: 2, muted: true }); assert.equal(p.clips[0].speed, 2);
  assert.equal(original.clips[0].speed, 1);
  p = reorderClip(p, a, 1); assert.equal(p.clips.find(c => c.id === a)?.startMs, 6000);
  p = removeClip(p, a); assert.equal(p.clips.length, 1);
});
test('text overlays affect timeline duration and validate', () => {
  let p = createProject(); p = addText(p, 'Hello', 2000, 4000);
  assert.equal(durationMs(p), 6000); assert.equal(p.texts[0].text, 'Hello');
  validateProject(p);
});
test('reject clips that reference a missing asset', () => {
  const p = addAsset(createProject(), media('a'));
  const broken = { ...p, assets: [] };
  assert.throws(() => validateProject(broken), /Invalid clip timeline/);
});
