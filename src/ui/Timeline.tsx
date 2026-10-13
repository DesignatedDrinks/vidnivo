import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Project, clipDurationMs, durationMs, trackEndMs } from '../domain/timeline';
import { ClipFilmstrip } from './ClipFilmstrip';
import { pixelsToTimeMs, timeMsToPixels } from '../domain/timelineCoordinates';

type Props = {
  project: Project;
  selectedId: string | null;
  selectedTextId: string | null;
  playheadMs: number;
  onSelect: (id: string, atMs: number) => void;
  onSelectText: (id: string, atMs: number) => void;
  onSeek: (ms: number) => void;
  onScrubStart?: () => void;
  onAddVideo?: () => void;
  onAddAudio?: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
};
const CYAN = '#27D7F7';
const TRACK_BG = '#1A1F27';
const ROW_VIDEO = 59;
const ROW_AUDIO = 43;
const ROW_TEXT = 38;
const RULER = 25;
const DURATION_MIN = 2000;

export function Timeline({ project, selectedId, selectedTextId, playheadMs,
  onSelect, onSelectText, onSeek, onScrubStart, onAddVideo, onAddAudio, zoom = 1, onZoomChange }: Props) {
  const pixelsPerSecond = 57 * zoom;
  const [width, setWidth] = useState(360);
  const dragRef = useRef(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const lastSyncMs = useRef(0);
  const endMs = Math.max(DURATION_MIN, durationMs(project));
  const contentWidth = Math.max(width + 8, endMs / 1000 * pixelsPerSecond + 85);
  const side = width / 2;
  const scrollOffset = timeMsToPixels(playheadMs, pixelsPerSecond, endMs);

  useEffect(() => {
    if (!dragRef.current && Math.abs(lastSyncMs.current - scrollOffset) > 0.4) {
      scroll.current?.scrollTo({ x: scrollOffset, animated: false });
      lastSyncMs.current = scrollOffset;
    }
  }, [scrollOffset, pixelsPerSecond, width]);

  const seekToOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragRef.current || pinchRef.current) return;
    const x = Math.max(0, event.nativeEvent.contentOffset.x);
    lastSyncMs.current = x;
    onSeek(pixelsToTimeMs(x, pixelsPerSecond, endMs));
  };

  const clipRows = useMemo(() =>
    project.clips.filter(c => c.track === 'video').sort((a,b) => a.startMs - b.startMs),
    [project.clips]);
  const soundRows = useMemo(() =>
    project.clips.filter(c => c.track === 'audio').sort((a,b) => a.startMs - b.startMs),
    [project.clips]);
  const trackWidth = Math.max(contentWidth, width);
  const place = (timeMs: number) => timeMsToPixels(timeMs, pixelsPerSecond, endMs);

  return <View style={styles.container} onLayout={e => setWidth(Math.max(200, e.nativeEvent.layout.width))}>
    <View style={styles.counter}>
      <Text style={styles.counterText}>{new Date(playheadMs).toISOString().slice(14,19)}
        <Text style={styles.total}> / {new Date(durationMs(project)).toISOString().slice(14,19)}</Text>
      </Text>
      <Text style={styles.scaleText}>Timeline  ·  {zoom.toFixed(1)}×</Text>
    </View>
    <ScrollView horizontal ref={scroll} showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onTouchStart={event => {
        const touches = event.nativeEvent.touches;
        if (touches.length === 2) {
          pinchRef.current = {
            distance: Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY),
            zoom
          };
          dragRef.current = false;
          onScrubStart?.();
        }
      }}
      onTouchMove={event => {
        const touches = event.nativeEvent.touches;
        const origin = pinchRef.current;
        if (touches.length !== 2 || !origin || origin.distance < 10 || !onZoomChange) return;
        const distance = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
        const next = Math.max(.5, Math.min(3, origin.zoom * distance / origin.distance));
        if (Math.abs(zoom - next) > .04) onZoomChange(next);
      }}
      onTouchEnd={event => { if (event.nativeEvent.touches.length < 2) pinchRef.current = null; }}
      onScrollBeginDrag={() => { if (pinchRef.current) return; dragRef.current = true; onScrubStart?.(); }}
      onScroll={seekToOffset}
      onScrollEndDrag={event => {
        seekToOffset(event);
        dragRef.current = false;
      }}
      onMomentumScrollBegin={() => { dragRef.current = true; }}
      onMomentumScrollEnd={event => {
        seekToOffset(event);
        dragRef.current = false;
      }}
      contentContainerStyle={{ paddingHorizontal: side }}>
      <View style={{ width: trackWidth }}>
        <View style={styles.ruler}>
          {Array.from({ length: Math.ceil(endMs / 2000) + 3 }, (_, i) => (
            <Pressable key={i} onPress={() => onSeek(i * 2000)}
              style={[styles.tick, { left: i * pixelsPerSecond * 2 }]}>
              <Text style={styles.tickText}>{String(i * 2).padStart(2,'0')}s</Text>
              <View style={styles.tickLine} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.lane, { height: ROW_VIDEO }]}>
          {clipRows.map(c => {
            const asset = project.assets.find(a => a.id === c.assetId);
            const w = Math.max(25, place(clipDurationMs(c)));
            return <Pressable key={c.id} onPress={() => onSelect(c.id, c.startMs)}
              style={[styles.videoClip, { left: place(c.startMs), width: w },
                selectedId === c.id && styles.selectedClip]}>
              {asset ? <ClipFilmstrip uri={asset.uri} kind={asset.kind} width={w} sourceMs={c.inMs} sourceEndMs={c.outMs} /> : null}
            </Pressable>;
          })}
          {onAddVideo ? <Pressable accessibilityLabel="Import more videos"
            onPress={onAddVideo} style={[styles.addClip, { left: place(trackEndMs(project, 'video')) + 7 }]}>
            <Ionicons name="add" color="#101518" size={27} />
          </Pressable> : null}
        </View>

        <View style={[styles.lane, { height: ROW_AUDIO, backgroundColor: '#202124' }]}>
          {soundRows.length === 0 && onAddAudio ?
            <Pressable onPress={onAddAudio} style={styles.emptyAudio}>
              <Ionicons name="musical-notes-outline" color="#8C8E94" size={18} />
              <Text style={styles.emptyAudioText}>+ Add audio</Text>
            </Pressable> : null}
          {soundRows.map(c => {
            const w = Math.max(32, place(clipDurationMs(c)));
            const asset = project.assets.find(a => a.id === c.assetId);
            return <Pressable key={c.id} onPress={() => onSelect(c.id, c.startMs)}
              style={[styles.audioClip, { left: place(c.startMs), width: w },
                selectedId === c.id && styles.selectedClip]}>
              {asset ? <ClipFilmstrip uri={asset.uri} kind="audio" width={w} /> : null}
            </Pressable>;
          })}
        </View>
        <View style={[styles.lane, { height: ROW_TEXT, backgroundColor: '#202124' }]}>
          {project.texts.map(t => <Pressable key={t.id}
            onPress={() => onSelectText(t.id, t.startMs)}
            style={[styles.textClip, { left: place(t.startMs),
              width: Math.max(30,place(t.endMs - t.startMs)) },
              selectedTextId === t.id && styles.selectedClip]}>
            <Text style={styles.captionText} numberOfLines={1}>{t.text}</Text>
          </Pressable>)}
        </View>
      </View>
    </ScrollView>
    <View pointerEvents="none" style={styles.fixedPlayhead}>
      <View style={styles.playheadKnob} />
      <View style={styles.playheadLine} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#11141A', height: 193, borderTopWidth: 1, borderColor: '#283241' },
  counter: { paddingHorizontal: 14, paddingTop: 3, height: 29,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counterText: { color: '#F4F4F6', fontSize: 12, fontVariant: ['tabular-nums'] },
  total: { color: '#96989B' },
  scaleText: { fontSize: 10, color: '#76787D' },
  ruler: { height: RULER, position: 'relative' },
  tick: { position: 'absolute', top: 0, height: RULER, width: 30, alignItems: 'flex-start' },
  tickText: { fontSize: 10, color: '#929397' },
  tickLine: { width: 1, height: 8, backgroundColor: '#595B61', marginTop: 3 },
  lane: { position: 'relative', borderBottomWidth: 3, borderBottomColor: '#151619', backgroundColor: TRACK_BG },
  videoClip: { position: 'absolute', height: ROW_VIDEO-4, top: 0,
    borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#50647D' },
  audioClip: { position: 'absolute', height: ROW_AUDIO-4, top: 0,
    backgroundColor: '#16464A', borderRadius: 5, overflow: 'hidden', justifyContent: 'center' },
  textClip: { position: 'absolute', height: ROW_TEXT-5, top: 0,
    backgroundColor: '#604A88', borderRadius: 4, justifyContent: 'center', paddingHorizontal: 6 },
  captionText: { color: '#FFF7EC', fontSize: 12, fontWeight: '600' },
  selectedClip: { borderWidth: 2.5, borderColor: CYAN },
  emptyAudio: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, marginLeft: 12 },
  emptyAudioText: { color: '#919295', fontSize: 13 },
  addClip: { position: 'absolute', top: 9, width: 39, height: 39,
    borderRadius: 7, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  fixedPlayhead: { position: 'absolute', top: 29, height: RULER + ROW_VIDEO + ROW_AUDIO + ROW_TEXT,
    width: 2, alignSelf: 'center', alignItems: 'center', zIndex: 10 },
  playheadKnob: { width: 9, height: 9, backgroundColor: '#FFFFFF', borderRadius: 5,
    marginTop: RULER - 3 },
  playheadLine: { width: 2, flex: 1, backgroundColor: '#FFFFFF' }
});
