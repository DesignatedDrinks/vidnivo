import type { LookSetting } from './looks.ts';
import { resolveLook } from './looks.ts';
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
  role?: 'title' | 'caption';
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
  look?: LookSetting;
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
export function addAsset(p: Project, asset: Asset, track: Track = asset.kind === 'audio' ? 'audio' : 'video', startAtMs?: number): Project {
  if (!asset.uri || !Number.isFinite(asset.durationMs) || asset.durationMs <= 0 ||
      !Number.isFinite(asset.width) || !Number.isFinite(asset.height) ||
      !['video','image','audio'].includes(asset.kind) ||
      (track === 'video' && asset.kind === 'audio') ||
      (track === 'audio' && asset.kind !== 'audio') ||
      (startAtMs !== undefined && (!Number.isFinite(startAtMs) || startAtMs < 0)))
    throw new Error('Invalid media');
  if (p.assets.some(a => a.id === asset.id)) throw new Error('Duplicate asset ID');
  const clip: Clip = {
    id: makeId(), assetId: asset.id, track, startMs: startAtMs === undefined ? trackEndMs(p, track) : Math.max(0, startAtMs),
    inMs: 0, outMs: asset.durationMs, speed: 1, volume: 1, muted: false
  };
  return touch({ ...p, assets: [...p.assets, asset], clips: [...p.clips, clip] });
}
export function splitClip(p: Project, id: string, positionMs: number): Project {
  if (!Number.isFinite(positionMs)) throw new Error('Invalid split position');
  const clip = p.clips.find(c => c.id === id);
  if (!clip) return p;
  const relativeMs = positionMs - clip.startMs;
  if (relativeMs < 250 || relativeMs > clipDurationMs(clip) - 250) return p;
  const cut = clip.inMs + relativeMs * clip.speed;
  const next: Clip = { ...clip, id: makeId(), inMs: cut, startMs: positionMs };
  return touch({ ...p, clips: p.clips.flatMap(c => c.id === id ? [{ ...c, outMs: cut }, next] : [c]) });
}
export function trimClip(p: Project, id: string, edge: 'left' | 'right', deltaMs: number): Project {
  if (!Number.isFinite(deltaMs) || (edge !== 'left' && edge !== 'right'))
    throw new Error('Invalid trim');
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
  if (!Number.isFinite(deltaMs)) throw new Error('Invalid clip movement');
  if (!p.clips.some(c => c.id === id) || deltaMs === 0) return p;
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
  if (changes.speed !== undefined && !Number.isFinite(changes.speed))
    throw new Error('Invalid clip speed');
  if (changes.volume !== undefined && !Number.isFinite(changes.volume))
    throw new Error('Invalid clip volume');
  if (changes.muted !== undefined && typeof changes.muted !== 'boolean')
    throw new Error('Invalid mute state');
  if (!p.clips.some(c => c.id === id)) return p;
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
  if (!Number.isFinite(startMs) || !Number.isFinite(lengthMs))
    throw new Error('Invalid text timing');
  if (!text.trim()) return p;
  const layer: TextLayer = { id: makeId(), text: text.trim(), startMs: Math.max(0, startMs), endMs: Math.max(0, startMs) + Math.max(500, lengthMs), x: 0.5, y: 0.75, fontSize: 32, color: '#FFFFFF', role: 'title' };
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
  // Validation is also the safety boundary for app restart, cloud sync and export.
  // Reject non-finite values before JSON serialization can replace NaN with null.
  if (!p || typeof p !== 'object' || !p.id || typeof p.id !== 'string' ||
      typeof p.name !== 'string' || !['9:16','16:9','1:1'].includes(p.aspectRatio) ||
      !Number.isInteger(p.revision) || p.revision < 1 ||
      !Array.isArray(p.assets) || !Array.isArray(p.clips) || !Array.isArray(p.texts))
    throw new Error('Invalid project metadata');
  if (p.look) resolveLook(p.look);
  const assetIds = new Set(p.assets.map(a => a.id));
  if (assetIds.size !== p.assets.length) throw new Error('Duplicate assets');
  if (p.assets.some(a =>
    typeof a.id !== 'string' || !a.id.trim() ||
    !['video','audio','image'].includes(a.kind) ||
    typeof a.uri !== 'string' || !a.uri ||
    typeof a.filename !== 'string' ||
    !Number.isFinite(a.durationMs) || a.durationMs <= 0 ||
    !Number.isFinite(a.width) || a.width < 0 ||
    !Number.isFinite(a.height) || a.height < 0))
    throw new Error('Invalid media asset');
  const byId = new Map(p.assets.map(a => [a.id,a]));
  const clipIds = new Set(p.clips.map(c => c.id));
  if (clipIds.size !== p.clips.length) throw new Error('Duplicate clips');
  if (p.clips.some(c => {
    const asset = byId.get(c.assetId);
    return !asset || typeof c.id !== 'string' || !c.id ||
      (c.track !== 'video' && c.track !== 'audio') ||
      (c.track === 'video' && asset.kind === 'audio') ||
      (c.track === 'audio' && asset.kind !== 'audio') ||
      !Number.isFinite(c.startMs) || c.startMs < 0 ||
      !Number.isFinite(c.inMs) || c.inMs < 0 ||
      !Number.isFinite(c.outMs) || c.outMs <= c.inMs ||
      c.outMs > asset.durationMs + 50 ||
      !Number.isFinite(c.speed) || c.speed < .25 || c.speed > 4 ||
      !Number.isFinite(c.volume) || c.volume < 0 || c.volume > 1 ||
      typeof c.muted !== 'boolean';
  })) throw new Error('Invalid clip timeline');
  const textIds = new Set(p.texts.map(t => t.id));
  if (textIds.size !== p.texts.length) throw new Error('Duplicate text layers');
  if (p.texts.some(t =>
    typeof t.id !== 'string' || !t.id ||
    typeof t.text !== 'string' || !t.text.trim() ||
    !Number.isFinite(t.startMs) || t.startMs < 0 ||
    !Number.isFinite(t.endMs) || t.endMs <= t.startMs ||
    !Number.isFinite(t.x) || t.x < 0 || t.x > 1 ||
    !Number.isFinite(t.y) || t.y < 0 || t.y > 1 ||
    !Number.isFinite(t.fontSize) || t.fontSize < 1 || t.fontSize > 200 ||
    typeof t.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(t.color) ||
    (t.role !== undefined && t.role !== 'caption' && t.role !== 'title')))
    throw new Error('Invalid text timeline');
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
    if (c.startMs >= originalEndMs - 0.01)
      return { ...c, startMs: Math.max(0, c.startMs - changeMs) };
    return c;
  });
  const texts = result.texts.map(text =>
    text.startMs >= originalEndMs - 0.01 ?
      { ...text, startMs: Math.max(0,text.startMs-changeMs),
        endMs: Math.max(250,text.endMs-changeMs) } : text);
  return { ...result, clips, texts };
}
/** Removes a clip and closes its gap on the primary video track. */
export function rippleDeleteClip(p: Project, id: string): Project {
  const original = p.clips.find(c => c.id === id);
  if (!original) return p;
  const deleted = removeClip(p, id);
  if (original.track !== 'video') return deleted;
  const endMs = clipEndMs(original);
  const spanMs = clipDurationMs(original);
  const clips = deleted.clips.map(c => c.startMs >= endMs - 0.01
      ? { ...c, startMs: Math.max(0, c.startMs - spanMs) } : c);
  const texts = deleted.texts.flatMap(t => {
    if (t.endMs <= original.startMs) return [t];
    if (t.startMs >= endMs - .01)
      return [{ ...t, startMs: Math.max(0,t.startMs-spanMs),
        endMs: Math.max(250,t.endMs-spanMs) }];
    if (t.startMs >= original.startMs && t.endMs <= endMs) return [];
    if (t.startMs < original.startMs && t.endMs > endMs)
      return [{ ...t, endMs: Math.max(t.startMs+250,t.endMs-spanMs) }];
    if (t.startMs < original.startMs)
      return original.startMs-t.startMs >= 250 ? [{...t,endMs:original.startMs}]:[];
    return t.endMs-endMs >= 250 ?
      [{...t,startMs:original.startMs,endMs:t.endMs-spanMs}]:[];
  });
  return { ...deleted, clips, texts };
}

/** Restoring a prior edit must still advance the saved revision. */
export function restoreHistorySnapshot(current: Project, snapshot: Project): Project {
  if (current.id !== snapshot.id) throw new Error('Cannot restore a different project');
  const revived = { ...snapshot, revision: current.revision + 1, updatedAt: stamp() };
  validateProject(revived);
  return revived;
}

/** Change caption text, styling, position or timing without losing history. */
export function editTextLayer(p: Project, id: string, changes: Partial<Omit<TextLayer, 'id'>>): Project {
  const previous = p.texts.find(t => t.id === id);
  if (!previous) return p;
  const text = changes.text === undefined ? previous.text : changes.text.trim();
  if (!text) return p;
  const start = Math.max(0, Math.round(changes.startMs ?? previous.startMs));
  const end = Math.max(start + 250, Math.round(changes.endMs ?? previous.endMs));
  const color = changes.color && /^#[0-9a-fA-F]{6}$/.test(changes.color) ? changes.color.toUpperCase() : previous.color;
  const modified: TextLayer = {
    ...previous, text, startMs: start, endMs: end,
    x: bound(changes.x ?? previous.x, 0.1, 0.9),
    y: bound(changes.y ?? previous.y, 0.1, 0.9),
    fontSize: Math.round(bound(changes.fontSize ?? previous.fontSize, 14, 96)),
    color
  };
  return touch({ ...p, texts: p.texts.map(t => t.id === id ? modified : t) });
}

/**
 * Magnetic speed edits keep downstream video contiguous, unlike freeform speed.
 * Standalone audio retains its start position.
 */
export function rippleSpeedClip(p: Project, id: string, speed: number): Project {
  const target = p.clips.find(c => c.id === id);
  if (!target) return p;
  const adjusted = editClip(p, id, { speed });
  if (target.track !== 'video') return adjusted;
  const updated = adjusted.clips.find(c => c.id === id)!;
  const shift = clipDurationMs(updated) - clipDurationMs(target);
  if (Math.abs(shift) < 0.001) return adjusted;
  const end = clipEndMs(target);
  const clips = adjusted.clips.map(c =>
    c.id !== id && c.startMs >= end - 0.01
      ? { ...c, startMs: Math.max(0, c.startMs + shift) } : c);
  const texts = adjusted.texts.map(text =>
    text.startMs >= end - 0.01 ?
      { ...text, startMs: Math.max(0,text.startMs+shift),
        endMs: Math.max(250,text.endMs+shift) } : text);
  return { ...adjusted, clips, texts };
}

/** Make a new reusable editing draft without changing the original project's IDs. */
export function duplicateProject(p: Project): Project {
  validateProject(p);
  const copy=createProject(p.name+' (copy)',p.aspectRatio);
  const remap=new Map<string,string>();
  const assets=p.assets.map(asset=>{
    const id=makeId();remap.set(asset.id,id);
    return {...asset,id};
  });
  return {...copy,
    assets,
    clips:p.clips.map(c=>({...c,id:makeId(),assetId:remap.get(c.assetId)!})),
    texts:p.texts.map(t=>({...t,id:makeId()})),
    look:p.look ? {...p.look} : undefined
  };
}

/**
 * Duplicate the selected clip next to itself. Video clips are inserted into
 * the primary magnetic track; later clips, independent audio and captions are
 * moved forward to preserve their positions relative to subsequent footage.
 * Standalone audio duplicates onto the audio track without rippling video.
 */
export function duplicateClip(p: Project, id: string): Project {
  const original=p.clips.find(c=>c.id===id);
  if(!original)return p;
  const duration=clipDurationMs(original);
  if(!Number.isFinite(duration) || duration < 250) throw Error('Clip is too short to duplicate.');
  const at=clipEndMs(original);
  const copy: Clip={...original,id:makeId(),startMs:at};
  if(original.track==='audio'){
    return touch({...p,clips:[...p.clips,copy]});
  }
  const clips=p.clips.map(c=>
    c.id!==id && c.startMs>=at-.001 ? {...c,startMs:c.startMs+duration} : c);
  const texts=p.texts.map(t=>
    t.startMs>=at-.001 ?
      {...t,startMs:t.startMs+duration,endMs:t.endMs+duration}:t);
  return touch({...p,clips:[...clips,copy],texts});
}

/** Precisely set the media source in/out point while preserving ripple alignment. */
export function setClipSourceEdge(p:Project,id:string,edge:'left'|'right',sourceTimeMs:number):Project {
  if(edge!=='left' && edge!=='right')return p;
  const clip=p.clips.find(c=>c.id===id);
  if(!clip)return p;
  const asset=p.assets.find(a=>a.id===clip.assetId);
  if(!asset || !Number.isFinite(sourceTimeMs))return p;
  const minimum=clip.speed*250;
  if(!Number.isFinite(minimum) || minimum<=0)return p;
  const value=edge==='left'
    ? bound(Math.round(sourceTimeMs),0,clip.outMs-minimum)
    : bound(Math.round(sourceTimeMs),clip.inMs+minimum,asset.durationMs);
  const current=edge==='left'?clip.inMs:clip.outMs;
  if(Math.abs(value-current)<0.1)return p;
  return rippleTrimClip(p,id,edge,(value-current)/clip.speed);
}

/** Apply an adjustable whole-project colour look. Resetting uses a neutral look. */
export function setProjectLook(p:Project, preset: import('./looks.ts').LookPreset, intensity = 100):Project {
  const look = resolveLook({preset,intensity});
  if ((p.look?.preset ?? 'none')===look.preset &&
      (p.look?.intensity ?? 100)===look.intensity) return p;
  return touch({...p,look});
}
