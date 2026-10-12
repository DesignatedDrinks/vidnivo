import React, { useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { activeClip, type Clip, type Project } from '../domain/timeline';

function ActiveAudio({ clip, uri, offsetSeconds, playing, seekVersion }:
  { clip: Clip; uri: string; offsetSeconds: number; playing: boolean; seekVersion: number }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    player.volume = clip.muted ? 0 : clip.volume;
    player.setPlaybackRate(Math.min(2, clip.speed));
  }, [player, clip.muted, clip.volume, clip.speed]);
  useEffect(() => {
    if (!status.isLoaded) return;
    player.seekTo(Math.max(0, offsetSeconds)).catch(() => {});
  }, [player, status.isLoaded, clip.id, seekVersion]);
  useEffect(() => {
    if (!status.isLoaded) return;
    if (playing) player.play();
    else player.pause();
  }, [player, status.isLoaded, playing]);
  return null;
}
export function AudioStage({ project, playheadMs, playing, seekVersion }:
  { project: Project; playheadMs: number; playing: boolean; seekVersion: number }) {
  const clip = activeClip(project, playheadMs, 'audio');
  const asset = project.assets.find(a => a.id === clip?.assetId);
  if (!clip || !asset || asset.kind !== 'audio') return null;
  const offsetSeconds = (clip.inMs + (playheadMs - clip.startMs) * clip.speed) / 1000;
  return <ActiveAudio key={clip.id} clip={clip} uri={asset.uri}
    offsetSeconds={offsetSeconds} playing={playing} seekVersion={seekVersion} />;
}
