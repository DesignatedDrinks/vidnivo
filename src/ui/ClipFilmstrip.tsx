import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';

function VideoFrames({ uri, firstSecond, width }: { uri: string; firstSecond: number; width: number }) {
  const player = useVideoPlayer(uri);
  const [frame, setFrame] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const thumbnails = await player.generateThumbnailsAsync([Math.max(0, firstSecond)], {
          maxWidth: 128, maxHeight: 80
        });
        if (active && thumbnails.length) setFrame(thumbnails[0]);
      } catch {
        // Unsupported codecs leave a clearly distinguishable fallback.
      }
    }
    const subscription = player.addListener('statusChange', event => {
      if (event.status === 'readyToPlay') void load();
    });
    void load();
    return () => { active = false; subscription.remove(); };
  }, [player, firstSecond]);
  const count = Math.max(1, Math.min(16, Math.ceil(width / 46)));
  return <View style={styles.frames}>
    {Array.from({ length: count }, (_, i) =>
      frame ? <Image key={i} source={frame as unknown as ImageSource} contentFit="cover" style={styles.thumbnail} />
        : <View key={i} style={styles.fallback}><Text style={styles.placeholder}>▧</Text></View>)}
  </View>;
}

export function ClipFilmstrip({ uri, kind, width, sourceMs = 0 }: {
  uri: string; kind: 'video' | 'image' | 'audio'; width: number; sourceMs?: number;
}) {
  if (kind === 'image') {
    const count = Math.max(1, Math.min(16, Math.ceil(width / 46)));
    return <View style={styles.frames}>
      {Array.from({ length: count }, (_, i) => <Image key={i} source={{ uri }}
        contentFit="cover" style={styles.thumbnail} />)}
    </View>;
  }
  if (kind === 'audio') return <View style={styles.wave}><Text style={styles.waveText}>▂▅▇▄▆▂▅▇▄▃▆▅</Text></View>;
  return <VideoFrames uri={uri} firstSecond={sourceMs / 1000} width={width} />;
}

const styles = StyleSheet.create({
  frames: { flexDirection: 'row', height: '100%', overflow: 'hidden', alignItems: 'stretch' },
  thumbnail: { width: 46, height: '100%', backgroundColor: '#36404A' },
  fallback: { height: '100%', width: 46, backgroundColor: '#384550',
    alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: '#282F39' },
  placeholder: { color: '#BFC9D0', fontSize: 23 },
  wave: { flex: 1, justifyContent: 'center', paddingLeft: 5 },
  waveText: { color: '#69D2C3', fontWeight: '800', fontSize: 15, letterSpacing: 1 }
});
