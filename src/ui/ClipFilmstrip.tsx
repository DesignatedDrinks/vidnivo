import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';
import { sampleThumbnailTimesMs } from '../domain/thumbnailSampling';

function VideoFrames({ uri, sourceStartMs, sourceEndMs, width }:
  { uri: string; sourceStartMs: number; sourceEndMs: number; width: number }) {
  const player = useVideoPlayer(uri);
  const count = Math.max(1, Math.min(10, Math.ceil(width / 46)));
  const frameWidth = Math.max(1, width / count);
  const [frames, setFrames] = useState<VideoThumbnail[]>([]);
  useEffect(() => {
    let active = true;
    let requested = false;
    async function load() {
      if (requested || !active) return;
      requested = true;
      try {
        const times = sampleThumbnailTimesMs(sourceStartMs, sourceEndMs, count)
          .map(ms => ms / 1000);
        const thumbnails = await player.generateThumbnailsAsync(times, { maxWidth: 128, maxHeight: 82 });
        if (active && thumbnails.length) setFrames(thumbnails);
      } catch {
        requested = false; // Allow another attempt when the video is ready.
      }
    }
    const subscription = player.addListener('statusChange', event => {
      if (event.status === 'readyToPlay') void load();
    });
    void load();
    return () => { active = false; subscription.remove(); };
  }, [player, sourceStartMs, sourceEndMs, count]);
  return <View style={styles.frames}>
    {Array.from({ length: count }, (_, i) => {
      const frame = frames[i] || frames[0];
      return frame ? <Image key={i} source={frame as unknown as ImageSource}
        contentFit="cover" style={{ width: frameWidth, height: '100%' }} /> :
        <View key={i} style={[styles.fallback, { width: frameWidth }]}>
          <Text style={styles.placeholder}>▧</Text>
        </View>;
    })}
  </View>;
}

export function ClipFilmstrip({ uri, kind, width, sourceMs = 0, sourceEndMs = 5000 }:
  { uri: string; kind: 'video' | 'image' | 'audio'; width: number; sourceMs?: number; sourceEndMs?: number }) {
  if (kind === 'image') {
    const count = Math.max(1, Math.min(10, Math.ceil(width / 46)));
    return <View style={styles.frames}>
      {Array.from({ length: count }, (_, i) => <Image key={i}
        source={{ uri }} contentFit="cover" style={{ width: width / count, height: '100%' }} />)}
    </View>;
  }
  if (kind === 'audio') return <View style={styles.wave}><Text style={styles.waveText}>▂▅▇▄▆▂▅▇▄▃▆▅</Text></View>;
  return <VideoFrames uri={uri} sourceStartMs={sourceMs} sourceEndMs={sourceEndMs} width={width} />;
}

const styles = StyleSheet.create({
  frames: { flexDirection: 'row', height: '100%', overflow: 'hidden', alignItems: 'stretch' },
  fallback: { height: '100%', backgroundColor: '#384550',
    alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: '#282F39' },
  placeholder: { color: '#BFC9D0', fontSize: 23 },
  wave: { flex: 1, justifyContent: 'center', paddingLeft: 5 },
  waveText: { color: '#69D2C3', fontWeight: '800', fontSize: 15, letterSpacing: 1 }
});
