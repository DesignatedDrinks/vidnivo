export type MediaKind = 'video' | 'image' | 'audio';
export type Track = 'video' | 'audio';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export interface Asset {
  id: string;
  kind: MediaKind;
  uri: string;
  filename: string;
  durationMs: number;
  width: number;
  height: number;
}
export interface Clip {
  id: string;
  assetId: string;
  track: Track;
  startMs: number;
  inMs: number;
  outMs: number;
  speed: number;
  volume: number;
  muted: boolean;
}
export interface TextLayer {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}
export interface Project {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  createdAt: string;
  updatedAt: string;
  revision: number;
  assets: Asset[];
  clips: Clip[];
  texts: TextLayer[];
}
const stamp = () => new Date().toISOString();
export const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
const touch = (p: Project): Project => ({ ...p, updatedAt: stamp(), revision: p.revision + 1 });
const bound = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const clipDurationMs = (c: Clip): number => (c.outMs - c.inMs) / c.speed;
export const clipEndMs = (c: Clip): number => c.startMs + clipDurationMs(c);
export const durationMs = (p: Project): number => Math.max(0, ...p.clips.map(clipEndMs), ...p.texts.map(t => t.endMs));
export const trackEndMs = (p: Project, track: Track): number => Math.max(0, ...p.clips.filter(c => c.track === track).map(clipEndMs));
export const createProject = (name = 'Untitled project', aspectRatio: AspectRatio = '9:16'): Project => {
  const now = stamp();
  return { id: makeId(), name, aspectRatio, createdAt: now, updatedAt: now, revision: 1, assets: [], clips: [], texts: [] };
};
export function addAsset(p: Project, asset: Asset, track: Track = asset.kind === 'audio' ? 'audio' : 'video'): Project {
  if (!asset.uri || !Number.isFinite(asset.durationMs) || asset.durationMs <= 0) throw new Error('Invalid media');
  if (p.assets.some(a => a.id === asset.id)) throw new Error('Duplicate asset ID');
  const clip: Clip = {
    id: makeId(), assetId: asset.id, track, startMs: trackEndMs(p, track),
    inMs: 0, outMs: asset.durationMs, speed: 1, volume: 1, muted: false
  };
  return touch({ ...p, assets: [...p.assets, asset], clips: [...p.clips, clip] });
}
export function splitClip(p: Project, id: string, positionMs: number): Project {
  const clip = p.clips.find(c => c.id === id);
  if (!clip) return p;
  const relativeMs = positionMs - clip.startMs;
  if (relativeMs < 250 || relativeMs > clipDurationMs(clip) - 250) return p;
  const cut = clip.inMs + relativeMs * clip.speed;
  const next: Clip = { ...clip, id: makeId(), inMs: cut, startMs: positionMs };
  return touch({ ...p, clips: p.clips.flatMap(c => c.id === id ? [{ ...c, outMs: cut }, next] : [c]) });
}
export function trimClip(p: Project, id: string, edge: 'left' | 'right', deltaMs: number): Project {
  const clip = p.clips.find(c => c.id === id);
  if (!clip) return p;
  const minSourceMs = 250 * clip.speed;
  let replacement: Clip;
  if (edge === 'left') {
    const newIn = bound(clip.inMs + deltaMs * clip.speed, 0, clip.outMs - minSourceMs);
    replacement = { ...clip, inMs: newIn, startMs: Math.max(0, clip.startMs + (newIn - clip.inMs) / clip.speed) };
  } else {
    const asset = p.assets.find(a => a.id === clip.assetId);
    const maxOut = asset?.durationMs ?? clip.outMs;
    replacement = { ...clip, outMs: bound(clip.outMs + deltaMs * clip.speed, clip.inMs + minSourceMs, maxOut) };
  }
  return touch({ ...p, clips: p.clips.map(c => c.id === id ? replacement : c) });
}
export function moveClip(p: Project, id: string, deltaMs: number): Project {
  return touch({ ...p, clips: p.clips.map(c => c.id === id ? { ...c, startMs: Math.max(0, Math.round(c.startMs + deltaMs)) } : c) });
}
export function reorderClip(p: Project, id: string, direction: -1 | 1): Project {
  const clip = p.clips.find(c => c.id === id);
  if (!clip) return p;
  const sorted = p.clips.filter(c => c.track === clip.track).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const index = sorted.findIndex(c => c.id === id), swap = index + direction;
  if (swap < 0 || swap >= sorted.length) return p;
  [sorted[index], sorted[swap]] = [sorted[swap], sorted[index]];
  let cursor = 0;
  const packed = new Map<string, Clip>();
  for (const c of sorted) { packed.set(c.id, { ...c, startMs: cursor }); cursor += clipDurationMs(c); }
  return touch({ ...p, clips: p.clips.map(c => packed.get(c.id) ?? c) });
}
export function editClip(p: Project, id: string, changes: Partial<Pick<Clip, 'speed' | 'volume' | 'muted'>>): Project {
  return touch({ ...p, clips: p.clips.map(c => c.id !== id ? c : {
    ...c,
    speed: changes.speed === undefined ? c.speed : bound(changes.speed, 0.25, 4),
    volume: changes.volume === undefined ? c.volume : bound(changes.volume, 0, 1),
    muted: changes.muted ?? c.muted
  }) });
}
export function removeClip(p: Project, id: string): Project {
  if (!p.clips.some(c => c.id === id)) return p;
  return touch({ ...p, clips: p.clips.filter(c => c.id !== id) });
}
export function addText(p: Project, text: string, startMs: number, lengthMs = 3000): Project {
  if (!text.trim()) return p;
  const layer: TextLayer = { id: makeId(), text: text.trim(), startMs: Math.max(0, startMs), endMs: Math.max(0, startMs) + Math.max(500, lengthMs), x: 0.5, y: 0.75, fontSize: 32, color: '#FFFFFF' };
  return touch({ ...p, texts: [...p.texts, layer] });
}
export function removeText(p: Project, id: string): Project {
  return touch({ ...p, texts: p.texts.filter(t => t.id !== id) });
}
export function activeClip(p: Project, t: number, track: Track = 'video'): Clip | undefined {
  return p.clips.filter(c => c.track === track && t >= c.startMs && t < clipEndMs(c))
    .sort((a, b) => b.startMs - a.startMs)[0];
}
export function validateProject(p: Project): void {
  const ids = new Set(p.assets.map(a => a.id));
  if (ids.size !== p.assets.length) throw new Error('Duplicate assets');
  if (p.clips.some(c => !ids.has(c.assetId) || c.startMs < 0 || c.inMs < 0 || c.outMs <= c.inMs || c.speed <= 0 || !Number.isFinite(c.speed) || !Number.isFinite(c.startMs))) throw new Error('Invalid clip timeline');
  if (p.texts.some(t => t.endMs <= t.startMs || t.startMs < 0)) throw new Error('Invalid text timeline');
}

/**
 * Magnetic/ripple editing keeps subsequent clips contiguous. The plain trimClip
 * remains available for slip/freeform timeline editing.
 */
export function rippleTrimClip(p: Project, id: string, edge: 'left' | 'right', deltaMs: number): Project {
  const original = p.clips.find(c => c.id === id);
  if (!original || original.track !== 'video') return trimClip(p, id, edge, deltaMs);
  const result = trimClip(p, id, edge, deltaMs);
  if (result === p) return p;
  const trimmed = result.clips.find(c => c.id === id)!;
  const changeMs = clipDurationMs(original) - clipDurationMs(trimmed);
  if (Math.abs(changeMs) < 0.0001) return p;
  const originalEndMs = clipEndMs(original);
  const clips = result.clips.map(c => {
    if (c.id === id) return { ...c, startMs: original.startMs };
    if (c.track === 'video' && c.startMs >= originalEndMs - 0.01)
      return { ...c, startMs: Math.max(0, c.startMs - changeMs) };
    return c;
  });
  return { ...result, clips };
}
/** Removes a clip and closes its gap on the primary video track. */
export function rippleDeleteClip(p: Project, id: string): Project {
  const original = p.clips.find(c => c.id === id);
  if (!original) return p;
  const deleted = removeClip(p, id);
  if (original.track !== 'video') return deleted;
  const endMs = clipEndMs(original);
  const spanMs = clipDurationMs(original);
  return { ...deleted, clips: deleted.clips.map(c =>
    c.track === 'video' && c.startMs >= endMs - 0.01
      ? { ...c, startMs: Math.max(0, c.startMs - spanMs) }
      : c
  ) };
}
