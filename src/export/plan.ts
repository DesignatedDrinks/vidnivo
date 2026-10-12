import type { Project, TextLayer, Clip } from '../domain/timeline.ts';
import { clipDurationMs, durationMs, validateProject } from '../domain/timeline.ts';
import { resolveLook, type LookSetting } from '../domain/looks.ts';

export interface RenderClip {
  uri: string;
  track: 'video' | 'audio';
  kind: 'video' | 'image' | 'audio';
  startMs: number;
  inMs: number;
  outMs: number;
  speed: number;
  volume: number;
  muted: boolean;
}
export interface ExportPlan {
  width: number;
  height: number;
  durationMs: number;
  clips: RenderClip[];
  texts: TextLayer[];
  look: LookSetting;
}
export function createExportPlan(project: Project, quality: 720 | 1080 = 1080): ExportPlan {
  validateProject(project);
  const dimensions = project.aspectRatio === '16:9'
    ? { width: Math.round(quality * 16 / 9), height: quality }
    : project.aspectRatio === '1:1'
      ? { width: quality, height: quality }
      : { width: quality, height: Math.round(quality * 16 / 9) };
  const visualClips = project.clips.filter(c => c.track === 'video')
    .sort((a, b) => a.startMs - b.startMs);
  if (!visualClips.length) throw new Error('Add a video or photo before exporting.');
  let cursor = 0;
  for (const clip of visualClips) {
    const asset = project.assets.find(a => a.id === clip.assetId);
    if (asset?.kind !== 'video' && asset?.kind !== 'image')
      throw new Error('The visual track must reference a video or photo.');
    if (asset.kind === 'image' && clipDurationMs(clip) > 120000)
      throw new Error('An individual photo cannot be displayed for more than two minutes.');
    if (!asset.uri.startsWith('file://')) throw new Error('A local video or photo file is required to export.');
    if (clip.outMs > asset.durationMs + 50) throw new Error('A video clip exceeds the source duration.');
    if (Math.abs(clip.startMs - cursor) > 33) {
      throw new Error(clip.startMs > cursor ? 'Remove timeline gaps before exporting.' : 'Overlapping video clips are not yet supported.');
    }
    cursor += clipDurationMs(clip);
  }
  const videoDurationMs = Math.round(cursor);
  const audio = project.clips.filter(c => c.track === 'audio');
  for (const clip of audio) {
    const asset = project.assets.find(a => a.id === clip.assetId);
    if (asset?.kind !== 'audio' || !asset.uri.startsWith('file://'))
      throw new Error('An audio clip must reference a local audio file.');
  }
  const clips = [...visualClips, ...audio].map((clip: Clip): RenderClip => {
    const asset = project.assets.find(a => a.id === clip.assetId)!;
    return { uri: asset.uri, track: clip.track, kind: asset.kind, startMs: Math.round(clip.startMs),
      inMs: Math.round(clip.inMs), outMs: Math.round(clip.outMs),
      speed: clip.speed, volume: clip.volume, muted: clip.muted };
  });
  if (videoDurationMs <= 0 || videoDurationMs > 15 * 60 * 1000)
    throw new Error('Export currently supports videos up to 15 minutes.');
  const texts = project.texts.filter(t => t.startMs < videoDurationMs)
    .map(t => ({ ...t, endMs: Math.min(t.endMs, videoDurationMs) }));
  return { ...dimensions, durationMs: videoDurationMs, clips, texts, look: resolveLook(project.look) };
}
