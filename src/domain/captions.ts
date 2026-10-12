import { type Project, type TextLayer, makeId, validateProject } from './timeline.ts';

export interface CaptionCue { startMs: number; endMs: number; text: string }
export type CaptionPreset = 'classic' | 'punch' | 'minimal' | 'neon' | 'documentary';
export const CAPTION_PRESETS: Record<CaptionPreset, Pick<TextLayer, 'fontSize'|'color'|'x'|'y'>> = {
  classic: { fontSize: 32, color: '#FFFFFF', x: .5, y: .75 },
  punch: { fontSize: 42, color: '#FFDD57', x: .5, y: .73 },
  minimal: { fontSize: 26, color: '#FFFFFF', x: .5, y: .84 },
  neon: { fontSize: 36, color: '#23D4E9', x: .5, y: .76 },
  documentary: { fontSize: 28, color: '#F5F5EB', x: .5, y: .87 }
};
function toMs(input: string): number {
  const clean = input.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length !== 2 && parts.length !== 3) return NaN;
  const last = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (![hours,minutes,last].every(Number.isFinite) || hours < 0 ||
      minutes < 0 || minutes >= 60 || last < 0 || last >= 60) return NaN;
  return Math.round(((hours * 60 + minutes) * 60 + last) * 1000);
}
export function parseCaptions(input: string): CaptionCue[] {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (source.length > 2_000_000) throw new Error('Subtitle file exceeds 2 MB.');
  const blocks = source.replace(/^WEBVTT[^\n]*\n?/i, '').split(/\n\s*\n/g);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length || /^(NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;
    const index = lines.findIndex(s => s.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const startMs = toMs(match[1]), endMs = toMs(match[2]);
    const text = lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) ||
        endMs <= startMs || !text) continue;
    cues.push({ startMs, endMs, text: text.slice(0,500) });
    if (cues.length > 3000) throw new Error('Too many subtitle cues. Limit is 3,000.');
  }
  return cues.sort((a,b) => a.startMs - b.startMs || a.endMs - b.endMs);
}
export function addCaptionCues(p: Project, cues: CaptionCue[], preset: CaptionPreset = 'classic'): Project {
  if (!cues.length) return p;
  validateProject(p);
  const style = CAPTION_PRESETS[preset];
  const overlays: TextLayer[] = cues.filter(c =>
    Number.isFinite(c.startMs) && Number.isFinite(c.endMs) &&
    c.startMs >= 0 && c.endMs > c.startMs && !!c.text.trim())
    .map(c => ({ id: makeId(), text: c.text.trim().slice(0, 500),
      startMs: Math.round(c.startMs), endMs: Math.round(c.endMs), ...style }));
  if (!overlays.length) return p;
  const now = new Date().toISOString();
  return { ...p, updatedAt: now, revision: p.revision + 1,
    texts: [...p.texts, ...overlays] };
}
export function restyleCaptions(p: Project, preset: CaptionPreset): Project {
  if (!p.texts.length) return p;
  const style = CAPTION_PRESETS[preset];
  return { ...p, updatedAt: new Date().toISOString(), revision: p.revision+1,
    texts: p.texts.map(t => ({ ...t, ...style })) };
}
function stamp(timeMs: number): string {
  const v = Math.max(0, Math.round(timeMs));
  const hh = Math.floor(v / 3600000), mm = Math.floor(v % 3600000 / 60000),
        ss = Math.floor(v % 60000 / 1000), ms = v % 1000;
  return [hh,mm,ss].map(n=>String(n).padStart(2,'0')).join(':') + ',' + String(ms).padStart(3,'0');
}
export function serializeSrt(cues: CaptionCue[]): string {
  return cues.filter(c=>c.endMs>c.startMs && c.text.trim()).map((cue,i) =>
    `${i+1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.text.trim()}\n`).join('\n');
}
export function captionsFromProject(p: Project): CaptionCue[] {
  return p.texts.map(t => ({ startMs:t.startMs, endMs:t.endMs, text:t.text }))
    .sort((a,b)=>a.startMs-b.startMs);
}

export interface RecognizedWord { startMs: number; endMs: number; text: string }
/** Segment automatic recognition into readable short-form caption groups. */
export function groupRecognizedWords(words: RecognizedWord[], maxWords = 5): CaptionCue[] {
  const ordered = words.filter(w => w.text.trim() &&
    Number.isFinite(w.startMs) && Number.isFinite(w.endMs) &&
    w.startMs >= 0 && w.endMs > w.startMs)
    .sort((a,b)=>a.startMs-b.startMs);
  const cues: CaptionCue[] = [];
  let group: RecognizedWord[] = [];
  const flush = () => {
    if (!group.length) return;
    cues.push({ startMs: group[0].startMs, endMs: group[group.length-1].endMs,
      text: group.map(w=>w.text.trim()).join(' ').replace(/\s+([,.!?;:])/g,'$1') });
    group = [];
  };
  for (const word of ordered) {
    const previous = group[group.length-1];
    if (previous && (word.startMs - previous.endMs >= 650 ||
      group.length >= maxWords || word.endMs - group[0].startMs > 2800 ||
      group.reduce((n,w)=>n+w.text.length+1,0) + word.text.length > 44)) flush();
    group.push(word);
    if (/[.!?]$/.test(word.text.trim())) flush();
  }
  flush();
  return cues;
}
/** Map source word timestamps through trim and speed onto a placed timeline clip. */
export function mapWordsToTimeline(words: RecognizedWord[],
  clip: Pick<import('./timeline.ts').Clip, 'startMs'|'inMs'|'outMs'|'speed'>): RecognizedWord[] {
  if (!Number.isFinite(clip.speed) || clip.speed <= 0) throw new Error('Invalid clip speed.');
  return words.filter(w => w.endMs > clip.inMs && w.startMs < clip.outMs)
    .map(w => {
      const from = Math.max(clip.inMs, w.startMs);
      const to = Math.min(clip.outMs, w.endMs);
      return { text: w.text,
        startMs: Math.round(clip.startMs + (from - clip.inMs) / clip.speed),
        endMs: Math.round(clip.startMs + (to - clip.inMs) / clip.speed) };
    })
    .filter(w => w.endMs > w.startMs);
}
