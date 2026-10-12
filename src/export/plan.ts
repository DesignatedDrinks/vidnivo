import type { Project, TextLayer, Clip } from '../domain/timeline.ts';
import { clipDurationMs, durationMs, validateProject } from '../domain/timeline.ts';

export interface RenderClip {
  uri: string;
  track: 'video' | 'audio';
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
}
export function createExportPlan(project: Project, quality: 720 | 1080 = 1080): ExportPlan {
  validateProject(project);
  const dimensions = project.aspectRatio === '16:9'
    ? { width: Math.round(quality * 16 / 9), height: quality }
    : project.aspectRatio === '1:1'
      ? { width: quality, height: quality }
      : { width: quality, height: Math.round(quality * 16 / 9) };
  const videoClips = project.clips.filter(c => c.track === 'video')
    .sort((a, b) => a.startMs - b.startMs);
  if (!videoClips.length) throw new Error('Add at least one video before exporting.');
  let cursor = 0;
  for (const clip of videoClips) {
    const asset = project.assets.find(a => a.id === clip.assetId);
    if (asset?.kind !== 'video') throw new Error('Photo rendering is not supported by the current exporter.');
    if (!asset.uri.startsWith('file://')) throw new Error('A local video file is required to export.');
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
  const clips = [...videoClips, ...audio].map((clip: Clip): RenderClip => {
    const asset = project.assets.find(a => a.id === clip.assetId)!;
    return { uri: asset.uri, track: clip.track, startMs: Math.round(clip.startMs),
      inMs: Math.round(clip.inMs), outMs: Math.round(clip.outMs),
      speed: clip.speed, volume: clip.volume, muted: clip.muted };
  });
  if (videoDurationMs <= 0 || videoDurationMs > 15 * 60 * 1000)
    throw new Error('Export currently supports videos up to 15 minutes.');
  const texts = project.texts.filter(t => t.startMs < videoDurationMs)
    .map(t => ({ ...t, endMs: Math.min(t.endMs, videoDurationMs) }));
  return { ...dimensions, durationMs: videoDurationMs, clips, texts };
}
