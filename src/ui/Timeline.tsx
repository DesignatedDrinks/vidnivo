import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clip, Project, clipDurationMs, durationMs } from '../domain/timeline';
import { theme } from './theme';

function lane({ project, track, selectedId, onSelect, pxPerSecond }:
  { project: Project; track: 'video' | 'audio'; selectedId: string | null; onSelect: (id: string, start: number) => void; pxPerSecond: number }) {
  const clips = project.clips.filter(c => c.track === track);
  return clips.map((c: Clip) => {
    const item = project.assets.find(a => a.id === c.assetId);
    const left = c.startMs / 1000 * pxPerSecond;
    const width = Math.max(30, clipDurationMs(c) / 1000 * pxPerSecond);
    return <Pressable key={c.id} onPress={() => onSelect(c.id, c.startMs)}
      style={[styles.clip, { left, width, backgroundColor: track === 'video' ? '#335E76' : '#5B4782' },
        selectedId === c.id && styles.selected]}>
      <Text numberOfLines={2} style={styles.clipLabel}>{track === 'audio' ? '♫ ' : '▣ '}{item?.filename || 'Missing file'}</Text>
    </Pressable>;
  });
}
export function Timeline({ project, selectedId, playheadMs, onSelect, onSeek, zoom = 1 }:
  { project: Project; selectedId: string | null; playheadMs: number; onSelect: (id: string, start: number) => void; onSeek: (ms: number) => void; zoom?: number }) {
  const pxPerSecond = 31 * zoom;
  const length = Math.max(600, durationMs(project) / 1000 * pxPerSecond + 90);
  return <View style={styles.wrap}>
    <View style={styles.header}><Text style={styles.title}>TIMELINE</Text><Text style={styles.scale}>Tap a clip to edit · tap the ruler to seek</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ width: length }}>
      <View style={{ width: length }}>
        <View style={styles.ruler}>
          {Array.from({ length: Math.ceil(length / (pxPerSecond * 2)) }, (_, i) =>
            <Pressable key={i} onPress={() => onSeek(i * 2000)} style={[styles.tick, { left: i * pxPerSecond * 2 }]}>
              <Text style={styles.time}>{i * 2}s</Text>
            </Pressable>)}
        </View>
        <View style={styles.lane}>
          <Text style={styles.laneMark}>V1</Text>
          {lane({ project, track: 'video', selectedId, onSelect, pxPerSecond })}
        </View>
        <View style={styles.lane}>
          <Text style={styles.laneMark}>A1</Text>
          {lane({ project, track: 'audio', selectedId, onSelect, pxPerSecond })}
        </View>
        <View style={styles.lane}>
          <Text style={styles.laneMark}>T</Text>
          {project.texts.map(t => <View key={t.id} style={[styles.titleClip, {
            left: t.startMs / 1000 * pxPerSecond,
            width: Math.max(28, (t.endMs - t.startMs) / 1000 * pxPerSecond)
          }]}><Text style={styles.clipLabel} numberOfLines={1}>{t.text}</Text></View>)}
        </View>
        <View pointerEvents="none" style={[styles.playhead, { left: playheadMs / 1000 * pxPerSecond }]} />
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.surface, borderRadius: 12, marginTop: 12, paddingVertical: 9 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 9 },
  title: { color: theme.text, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  scale: { color: theme.muted, fontSize: 10 },
  ruler: { height: 29, backgroundColor: '#191F29' },
  tick: { position: 'absolute', borderLeftColor: theme.border, borderLeftWidth: 1, height: 29, paddingLeft: 5, paddingTop: 7 },
  time: { color: theme.muted, fontSize: 10 },
  lane: { height: 53, borderBottomColor: theme.border, borderBottomWidth: 1, position: 'relative' },
  laneMark: { color: '#737B87', fontSize: 10, position: 'absolute', right: 5, bottom: 2, zIndex: 1 },
  clip: { position: 'absolute', top: 6, height: 42, borderRadius: 6, paddingHorizontal: 5, justifyContent: 'center' },
  selected: { borderColor: theme.accent, borderWidth: 2 },
  clipLabel: { fontSize: 10, fontWeight: '700', color: '#F3F6FC' },
  titleClip: { position: 'absolute', top: 7, height: 36, backgroundColor: '#7E6539', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 5 },
  playhead: { width: 2, backgroundColor: theme.accent, top: 0, bottom: 0, position: 'absolute', zIndex: 8 }
});
