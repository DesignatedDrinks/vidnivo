import React, { useEffect } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { activeClip, Clip, Project } from '../domain/timeline';
import { theme } from './theme';

function VideoClip({ uri, clip, sourceSeconds, playing, seekVersion }:
  { uri: string; clip: Clip; sourceSeconds: number; playing: boolean; seekVersion: number }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.currentTime = sourceSeconds;
  });
  useEffect(() => {
    player.volume = clip.muted ? 0 : clip.volume;
    player.playbackRate = clip.speed;
  }, [player, clip.volume, clip.muted, clip.speed]);
  useEffect(() => {
    player.currentTime = sourceSeconds;
  }, [player, seekVersion]);
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  return <VideoView player={player} nativeControls={false} contentFit="contain" style={StyleSheet.absoluteFill} />;
}
export function VideoStage({ project, playheadMs, playing, seekVersion, maxHeight = 355 }:
  { project: Project; playheadMs: number; playing: boolean; seekVersion: number; maxHeight?: number }) {
  const clip = activeClip(project, playheadMs);
  const asset = project.assets.find(a => a.id === clip?.assetId);
  const seconds = clip ? (clip.inMs + (playheadMs - clip.startMs) * clip.speed) / 1000 : 0;
  const visible = project.texts.filter(t => playheadMs >= t.startMs && playheadMs < t.endMs);
  const aspectRatio = project.aspectRatio === '9:16' ? 9 / 16 : project.aspectRatio === '16:9' ? 16 / 9 : 1;
  const previewWidth = Math.max(70, Math.min(Dimensions.get('window').width - 28, maxHeight * aspectRatio));
  return <View style={[styles.frame, { aspectRatio, width: previewWidth }]}>
    {!asset ? <View style={styles.placeholder}><Text style={styles.mark}>V</Text><Text style={styles.placeholderLabel}>Import video to begin</Text></View> : null}
    {asset?.kind === 'image' ? <Image source={{ uri: asset.uri }} resizeMode="contain" style={styles.full} /> : null}
    {asset?.kind === 'video' && clip ? <VideoClip key={clip.id} uri={asset.uri} clip={clip} sourceSeconds={seconds} playing={playing} seekVersion={seekVersion} /> : null}
    {visible.map(layer => <View key={layer.id} pointerEvents="none" style={[styles.textHolder, { top: `${layer.y * 100}%`,
      left: previewWidth * layer.x - previewWidth * 0.45, width: previewWidth * 0.9,
      right: undefined, transform: [{ translateY: -Math.max(14, layer.fontSize) * 0.6 }] }]}>
      <Text style={[styles.overlay, { color: layer.color, fontSize: Math.max(14, layer.fontSize) }]}>{layer.text}</Text>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  frame: { backgroundColor: '#06080A', overflow: 'hidden', alignSelf: 'center', justifyContent: 'center' },
  full: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', height: '100%' },
  mark: { fontSize: 64, fontWeight: '900', color: theme.accent },
  placeholderLabel: { color: theme.muted, fontSize: 12, marginTop: 8 },
  textHolder: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  overlay: { color: 'white', fontWeight: '800', textAlign: 'center', textShadowColor: '#000000', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } }
});
