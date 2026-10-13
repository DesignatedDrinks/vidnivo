import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { activeClip, Clip, Project } from '../domain/timeline';
import { theme } from './theme';
import { lookOverlay } from '../domain/looks';

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
  return <VideoView player={player} nativeControls={false}
    surfaceType={Platform.OS === 'android' ? 'textureView' : undefined} contentFit="contain" style={StyleSheet.absoluteFill} />;
}
export function VideoStage({ project, playheadMs, playing, seekVersion, maxHeight = 355, onCaptionPlacement }:
  { project: Project; playheadMs: number; playing: boolean; seekVersion: number; maxHeight?: number;
    onCaptionPlacement?: (placement: {x:number;y:number;fontSize?:number}) => void }) {
  const [previewAnchor,setPreviewAnchor]=useState<{x:number;y:number}|null>(null);
  const [previewSize,setPreviewSize]=useState<number|null>(null);
  const placement=useRef<{x:number;y:number}|null>(null);
  const resize=useRef<number|null>(null);
  const pinch=useRef<{distance:number;size:number}|null>(null);
  const clearGesture=()=>{
   placement.current=null;resize.current=null;pinch.current=null;
   setPreviewAnchor(null);setPreviewSize(null);
  };
  const clip = activeClip(project, playheadMs);
  const asset = project.assets.find(a => a.id === clip?.assetId);
  const seconds = clip ? (clip.inMs + (playheadMs - clip.startMs) * clip.speed) / 1000 : 0;
  const visible = project.texts.filter(t => playheadMs >= t.startMs && playheadMs < t.endMs);
  const tint = lookOverlay(project.look);
  const aspectRatio = project.aspectRatio === '9:16' ? 9 / 16 : project.aspectRatio === '16:9' ? 16 / 9 : 1;
  const previewWidth = Math.max(70, Math.min(Dimensions.get('window').width - 28, maxHeight * aspectRatio));
  const subtitle=visible.find(layer=>layer.role!=='title');
  const movable=Boolean(subtitle && onCaptionPlacement);
  const within=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
  return <View style={[styles.frame, { aspectRatio, width: previewWidth }]}
    onStartShouldSetResponderCapture={()=>movable}
    onMoveShouldSetResponderCapture={()=>movable}
    onResponderGrant={()=>{clearGesture();}}
    onResponderMove={event=>{
      if(!movable)return;
      const x=Number(event.nativeEvent.locationX)/previewWidth;
      const y=Number(event.nativeEvent.locationY)/(previewWidth/aspectRatio);
      if(Number.isFinite(x)&&Number.isFinite(y)){
       const next={x:within(x,.1,.9),y:within(y,.12,.88)};
       placement.current=next;setPreviewAnchor(next);
      }
      const touches=event.nativeEvent.touches;
      if(touches?.length>=2&&subtitle){
       const [a,b]=touches;
       const distance=Math.hypot(a.pageX-b.pageX,a.pageY-b.pageY);
       if(distance>4){
        if(!pinch.current)pinch.current={distance,size:subtitle.fontSize};
        const size=within(Math.round(pinch.current.size*distance/pinch.current.distance),14,90);
        resize.current=size;setPreviewSize(size);
       }
      }
    }}
    onResponderRelease={()=>{
      if(movable&&(placement.current||resize.current!==null)){
       onCaptionPlacement?.({
        x:placement.current?.x??subtitle?.x??.5,
        y:placement.current?.y??subtitle?.y??.72,
        ...(resize.current===null?{}:{fontSize:resize.current})
       });
      }
      clearGesture();
    }}
    onResponderTerminate={clearGesture}>
    {!asset ? <View style={styles.placeholder}><Text style={styles.mark}>V</Text><Text style={styles.placeholderLabel}>Import video to begin</Text></View> : null}
    {asset?.kind === 'image' ? <Image source={{ uri: asset.uri }} resizeMode="contain" style={styles.full} /> : null}
    {asset?.kind === 'video' && clip ? <VideoClip key={clip.id} uri={asset.uri} clip={clip} sourceSeconds={seconds} playing={playing} seekVersion={seekVersion} /> : null}
    {tint.alpha > 0 ? <View pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: tint.color, opacity: tint.alpha }]} /> : null}
    {visible.map(layer => {
      const isSubtitle=layer.role!=='title';
      const x=isSubtitle?(previewAnchor?.x??layer.x):layer.x;
      const y=isSubtitle?(previewAnchor?.y??layer.y):layer.y;
      const fontSize=isSubtitle?(previewSize??layer.fontSize):layer.fontSize;
      return <View key={layer.id} pointerEvents="none" style={[styles.textHolder, { top: `${y * 100}%`,
        left: previewWidth * x - previewWidth * 0.45, width: previewWidth * 0.9,
        right: undefined, transform: [{ translateY: -Math.max(14, fontSize) * 0.6 }] }]}>
        <Text style={[styles.overlay, { color: layer.color, fontSize: Math.max(14, fontSize) }]}>{layer.text}</Text>
      </View>;
    })}
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
