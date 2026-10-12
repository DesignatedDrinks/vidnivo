import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Slider from '@react-native-community/slider';
import { probeAudioDurationMs } from './src/media/audioProbe';
import { Directory, File, Paths } from 'expo-file-system';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AudioStage } from './src/ui/AudioStage';
import { canExportNatively, exportMp4, shareExport } from './src/export/native';
import { addAsset, addText, activeClip, createProject, durationMs, editClip, makeId, moveClip, Project, removeClip, removeText, reorderClip, splitClip, rippleTrimClip, rippleDeleteClip } from './src/domain/timeline';
import { loadLocalProjects, saveLocalProjects } from './src/data/storage';
import { loadRemoteProjects, saveProjectToSheets } from './src/data/sheets';
import { VideoStage } from './src/ui/VideoStage';
import { Timeline } from './src/ui/Timeline';
import { theme } from './src/ui/theme';

WebBrowser.maybeCompleteAuthSession();
const GOOGLE_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const configured = Boolean(GOOGLE_ANDROID && GOOGLE_IOS);
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
function Tool({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.tool, primary && styles.primaryTool, disabled && { opacity: .35 }]}>
    <Text style={[styles.toolText, primary && { color: theme.accentText }]}>{label}</Text>
  </Pressable>;
}
function EditorApp() {
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seekVersion, setSeekVersion] = useState(0);
  const [textPrompt, setTextPrompt] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [namePrompt, setNamePrompt] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [token, setToken] = useState<string | null>(null);
  const undo = useRef<Project[]>([]);
  const redo = useRef<Project[]>([]);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS || 'not-configured.apps.googleusercontent.com',
    androidClientId: GOOGLE_ANDROID || 'not-configured.apps.googleusercontent.com',
    webClientId: GOOGLE_WEB || 'not-configured.apps.googleusercontent.com',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets'],
    selectAccount: true
  });
  useEffect(() => { if (response?.type === 'success' && response.authentication?.accessToken) setToken(response.authentication.accessToken); }, [response]);
  useEffect(() => {
    loadLocalProjects().then(p => setProjects(p)).catch(e => Alert.alert('Could not load local projects', String(e))).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => saveLocalProjects(projects));
    writeQueue.current.catch(e => console.error('Local save failed', e));
  }, [ready, projects]);
  const project = projects.find(p => p.id === editingId) ?? null;
  const selected = project?.clips.find(c => c.id === selectedId) ?? null;
  const total = project ? durationMs(project) : 0;
  const timelinePosition = useRef(positionMs);
  useEffect(() => { timelinePosition.current = positionMs; }, [positionMs]);
  useEffect(() => {
    if (!playing || !project) return;
    let last = Date.now();
    const interval = setInterval(() => {
      const now = Date.now(), delta = now - last; last = now;
      setPositionMs(previous => {
        if (previous + delta >= durationMs(project)) { setPlaying(false); setSeekVersion(v => v + 1); return 0; }
        return previous + delta;
      });
    }, 75);
    return () => clearInterval(interval);
  }, [playing, editingId, project?.id, project?.revision]);

  const apply = (operation: (p: Project) => Project) => {
    if (!project) return;
    const updated = operation(project);
    if (updated === project) return;
    undo.current.push(project);
    if (undo.current.length > 50) undo.current.shift();
    redo.current = [];
    setProjects(existing => existing.map(p => p.id === project.id ? updated : p));
  };
  const undoAction = () => {
    if (!project) return;
    const prior = undo.current.pop(); if (!prior) return;
    redo.current.push(project);
    setProjects(existing => existing.map(p => p.id === project.id ? prior : p));
  };
  const redoAction = () => {
    if (!project) return;
    const next = redo.current.pop(); if (!next) return;
    undo.current.push(project);
    setProjects(existing => existing.map(p => p.id === project.id ? next : p));
  };
  const seek = (ms: number) => { setPlaying(false); setPositionMs(Math.max(0, Math.min(total, ms))); setSeekVersion(v => v + 1); };
  const openProject = (p: Project) => {
    setEditingId(p.id); setSelectedId(null); setPositionMs(0); setPlaying(false); setLastExport(null); setTimelineZoom(1);
    undo.current = []; redo.current = [];
  };
  const create = () => {
    const p = createProject('New video');
    setProjects(existing => [p, ...existing]);
    openProject(p);
  };
  const savedMedia = async (uri: string, filename: string): Promise<string> => {
    try {
      const folder = new Directory(Paths.document, 'vidnivo-media');
      await folder.create({ idempotent: true, intermediates: true });
      const ext = filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.mp4';
      const file = new File(folder, makeId() + ext);
      await new File(uri).copy(file);
      return file.uri;
    } catch (error) {
      throw new Error('Unable to save a persistent media copy. Import cancelled to prevent losing the source file: ' + String(error));
    }
  };
  const importVisual = async () => {
    if (!project) return;
    try {
      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 12, quality: 1
      });
      if (picker.canceled) return;
      setBusy(true);
      const assets = await Promise.all(picker.assets.map(async item => ({
        id: makeId(), uri: await savedMedia(item.uri, item.fileName || (item.type === 'video' ? 'video.mp4' : 'photo.jpg')),
        filename: item.fileName || (item.type === 'video' ? 'video.mp4' : 'photo.jpg'), kind: item.type === 'video' ? 'video' as const : 'image' as const,
        durationMs: item.type === 'video' ? Math.max(500, item.duration ?? 5000) : 5000,
        width: item.width || 0, height: item.height || 0
      })));
      apply(p => assets.reduce((current, asset) => addAsset(current, asset), p));
    } catch (error) { Alert.alert('Import failed', String(error)); }
    finally { setBusy(false); }
  };
  const importAudio = async () => {
    if (!project) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      setBusy(true);
      const assets = await Promise.all(result.assets.map(async item => {
        const uri = await savedMedia(item.uri, item.name);
        return {
          id: makeId(), uri,
          filename: item.name, kind: 'audio' as const,
          durationMs: await probeAudioDurationMs(uri), width: 0, height: 0
        };
      }));
      apply(p => assets.reduce((current, asset) => addAsset(current, asset), p));
    } catch (error) { Alert.alert('Audio import failed', String(error)); }
    finally { setBusy(false); }
  };
  const renderVideo = async () => {
    if (!project) return;
    try {
      setPlaying(false); setBusy(true);
      const uri = await exportMp4(project);
      setLastExport(uri);
      Alert.alert('MP4 exported', 'Your video is ready. Tap Share MP4 to save or send it.');
    } catch (e) {
      Alert.alert('Export unavailable', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const cloudSave = async () => {
    if (!token || !project) return;
    try { setBusy(true); await saveProjectToSheets(token, project); Alert.alert('Saved', 'Project metadata uploaded to Google Sheets. Media remains on this phone.'); }
    catch (e) { Alert.alert('Cloud save failed', String(e)); }
    finally { setBusy(false); }
  };
  const cloudPull = async () => {
    if (!token) return;
    try {
      setBusy(true);
      const remote = await loadRemoteProjects(token);
      setProjects(existing => {
        const merged = new Map(existing.map(p => [p.id, p]));
        for (const r of remote) {
          const local = merged.get(r.id);
          if (!local || r.revision > local.revision) merged.set(r.id, r);
        }
        return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      Alert.alert('Google Sheets synced', `${remote.length} cloud projects found. Remote edits with newer revisions were imported.`);
    } catch (e) { Alert.alert('Cloud sync failed', String(e)); }
    finally { setBusy(false); }
  };
  if (!ready) return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  if (!project) return <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
    <View style={styles.heading}><Text style={styles.logo}>VID<Text style={{ color: theme.accent }}>NIVO</Text></Text><Text style={styles.eyebrow}>MOBILE VIDEO STUDIO</Text></View>
    <View style={styles.hero}><Text style={styles.heroTitle}>Make something worth watching.</Text><Text style={styles.heroCopy}>Cut video, arrange your timeline, add captions, and keep projects on your phone.</Text><Tool label="+ New project" primary onPress={create} /></View>
    <View style={styles.row}><Text style={styles.section}>YOUR PROJECTS</Text><Text style={styles.meta}>{projects.length} saved</Text></View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      {projects.length === 0 && <Text style={styles.empty}>Create a project to start editing.</Text>}
      {projects.map(p => <Pressable key={p.id} onPress={() => openProject(p)} style={styles.projectCard}>
        <View style={styles.projectThumbnail}><Text style={{ fontSize: 25, color: theme.accent }}>▶</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.projectName}>{p.name}</Text><Text style={styles.meta}>{p.aspectRatio}  ·  {fmt(durationMs(p))}  ·  {p.clips.length} clips</Text></View>
        <Text style={{ color: theme.accent, fontSize: 24 }}>›</Text>
      </Pressable>)}
    </ScrollView>
    <View style={styles.connect}>
      <Text style={styles.section}>GOOGLE SHEETS DATABASE</Text>
      <Text style={styles.meta}>{token ? 'Connected — authorized for Google Sheets' : configured ? 'Sign in to sync project metadata' : 'Local editing ready. Google OAuth client IDs must be configured for sync.'}</Text>
      <View style={styles.controls}>
        {!token ? <Tool label="Connect Google" disabled={!configured || !request} onPress={() => { promptAsync().catch(e => Alert.alert('Sign in failed', String(e))); }} /> :
          <Tool label="Pull projects from Sheets" onPress={cloudPull} disabled={busy} />}
      </View>
    </View>
    {busy && <ActivityIndicator color={theme.accent} />}
    <StatusBar style="light" />
  </View>;

  return <View style={[styles.screen, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 7 }]}>
    <View style={styles.editorBar}>
      <Tool label="← Projects" onPress={() => { setEditingId(null); setPlaying(false); }} />
      <View style={{ flex: 1, alignItems: 'center' }}><Text style={styles.projectName} numberOfLines={1}>{project.name}</Text><Text style={styles.meta}>Autosaved locally</Text></View>
      <Tool label="Save" disabled={!token || busy} onPress={cloudSave} />
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 22 }}>
      <View style={styles.previewContainer}>
        <VideoStage project={project} playheadMs={positionMs} playing={playing} seekVersion={seekVersion} />
        <AudioStage project={project} playheadMs={positionMs} playing={playing} seekVersion={seekVersion} />
      </View>
      <View style={styles.transport}>
        <Text style={styles.clock}>{fmt(positionMs)} <Text style={styles.meta}>/ {fmt(total)}</Text></Text>
        <View style={styles.controls}>
          <Tool label="−1s" onPress={() => seek(positionMs - 1000)} />
          <Tool label={playing ? '❚❚ Pause' : '▶ Play'} primary onPress={() => {
            if (total === 0) return;
            if (positionMs >= total) seek(0);
            setPlaying(v => !v);
          }} />
          <Tool label="+1s" onPress={() => seek(positionMs + 1000)} />
        </View>
        <Text style={styles.meta}> {project.aspectRatio}</Text>
      </View>
      <Slider
        minimumValue={0} maximumValue={Math.max(total, 1)} step={50} value={positionMs}
        minimumTrackTintColor={theme.accent} maximumTrackTintColor={theme.border} thumbTintColor={theme.accent}
        onSlidingStart={() => setPlaying(false)}
        onValueChange={setPositionMs}
        onSlidingComplete={seek}
      />
      <View style={styles.row}>
        <Text style={styles.meta}>Timeline zoom: {timelineZoom.toFixed(1)}×</Text>
        <View style={styles.controls}>
          <Tool label="− Zoom" disabled={timelineZoom <= 0.5} onPress={() => setTimelineZoom(v => Math.max(.5, v - .5))} />
          <Tool label="+ Zoom" disabled={timelineZoom >= 3} onPress={() => setTimelineZoom(v => Math.min(3, v + .5))} />
        </View>
      </View>
      <Timeline project={project} playheadMs={positionMs} selectedId={selectedId} zoom={timelineZoom}
        onSelect={(id, start) => { setSelectedId(id); seek(start); }} onSeek={seek} />
      <View style={[styles.controls, { marginTop: 10, paddingHorizontal: 4 }]}>
        <Tool label="+ Video" onPress={importVisual} disabled={busy} />
        <Tool label="+ Audio" onPress={importAudio} disabled={busy} />
        <Tool label="+ Text" onPress={() => setTextPrompt(true)} />
        <Tool label="Undo" onPress={undoAction} disabled={!undo.current.length} />
        <Tool label="Redo" onPress={redoAction} disabled={!redo.current.length} />
      </View>
      {selected ? <View style={styles.toolsPanel}>
        <View style={styles.row}><Text style={styles.section}>SELECTED CLIP</Text><Text style={styles.meta}>{fmt(clipDurationSafe(selected))}</Text></View>
        <View style={styles.controls}>
          <Tool label="Split" onPress={() => apply(p => splitClip(p, selected.id, positionMs))} />
          <Tool label="← Trim" onPress={() => apply(p => rippleTrimClip(p, selected.id, 'left', 500))} />
          <Tool label="Trim →" onPress={() => apply(p => rippleTrimClip(p, selected.id, 'right', -500))} />
          <Tool label="Delete" onPress={() => { apply(p => rippleDeleteClip(p, selected.id)); setSelectedId(null); }} />
        </View>
        <View style={styles.controls}>
          <Tool label="← Move" onPress={() => apply(p => moveClip(p, selected.id, -500))} />
          <Tool label="Move →" onPress={() => apply(p => moveClip(p, selected.id, 500))} />
          <Tool label="◀ Order" onPress={() => apply(p => reorderClip(p, selected.id, -1))} />
          <Tool label="Order ▶" onPress={() => apply(p => reorderClip(p, selected.id, 1))} />
        </View>
        <Text style={styles.meta}>Clip volume: {Math.round(selected.volume * 100)}%</Text>
        <Slider minimumValue={0} maximumValue={1} step={0.05} value={selected.volume}
          minimumTrackTintColor={theme.accent} maximumTrackTintColor={theme.border} thumbTintColor={theme.accent}
          onSlidingComplete={volume => apply(p => editClip(p, selected.id, { volume }))} />
        <View style={styles.controls}>
          <Tool label="0.5×" onPress={() => apply(p => editClip(p, selected.id, { speed: .5 }))} />
          <Tool label="1×" onPress={() => apply(p => editClip(p, selected.id, { speed: 1 }))} />
          <Tool label="2×" onPress={() => apply(p => editClip(p, selected.id, { speed: 2 }))} />
          <Tool label={selected.muted ? 'Unmute' : 'Mute'} onPress={() => apply(p => editClip(p, selected.id, { muted: !selected.muted }))} />
        </View>
      </View> : <View style={styles.toolsPanel}><Text style={styles.meta}>Select a clip to trim, split, move, or change playback speed.</Text></View>}
      <View style={styles.controls}>
        <Tool label="9:16" onPress={() => apply(p => ({ ...p, aspectRatio: '9:16', revision: p.revision + 1, updatedAt: new Date().toISOString() }))} />
        <Tool label="16:9" onPress={() => apply(p => ({ ...p, aspectRatio: '16:9', revision: p.revision + 1, updatedAt: new Date().toISOString() }))} />
        <Tool label="1:1" onPress={() => apply(p => ({ ...p, aspectRatio: '1:1', revision: p.revision + 1, updatedAt: new Date().toISOString() }))} />
        <Tool label="Rename" onPress={() => { setProjectName(project.name); setNamePrompt(true); }} />
      </View>
      <View style={styles.controls}>
        <Tool label="Delete latest text" disabled={!project.texts.length} onPress={() => apply(p => removeText(p, p.texts[p.texts.length - 1].id))} />
        <Tool label="Export MP4" disabled={!canExportNatively() || busy} onPress={renderVideo} />
        {lastExport ? <Tool label="Share MP4" onPress={() => shareExport(lastExport).catch(e => Alert.alert('Could not share', String(e)))} /> : null}
      </View>
      <Text style={styles.disclaimer}>Native MP4 export is available only in the iOS development build and currently supports consecutive video segments with optional audio and titles. Expo Go can preview edits but cannot export. AI effects remain in development.</Text>
    </ScrollView>
    <Modal visible={textPrompt} transparent animationType="fade" onRequestClose={() => setTextPrompt(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <Text style={styles.section}>ADD TEXT OVERLAY</Text>
          <TextInput placeholder="Your title or caption" placeholderTextColor={theme.muted} value={titleText}
            onChangeText={setTitleText} multiline style={styles.field} />
          <View style={styles.controls}>
            <Tool label="Cancel" onPress={() => setTextPrompt(false)} />
            <Tool label="Add to timeline" primary onPress={() => { apply(p => addText(p, titleText, positionMs)); setTitleText(''); setTextPrompt(false); }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={namePrompt} transparent animationType="fade" onRequestClose={() => setNamePrompt(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <Text style={styles.section}>PROJECT NAME</Text>
          <TextInput value={projectName} onChangeText={setProjectName} style={styles.field} />
          <View style={styles.controls}>
            <Tool label="Cancel" onPress={() => setNamePrompt(false)} />
            <Tool label="Save name" primary onPress={() => { if (projectName.trim()) apply(p => ({ ...p, name: projectName.trim(), revision: p.revision + 1, updatedAt: new Date().toISOString() })); setNamePrompt(false); }} />
          </View>
        </View>
      </View>
    </Modal>
    {busy && <View style={styles.busy}><ActivityIndicator color={theme.accent} /></View>}
    <StatusBar style="light" />
  </View>;
}
function clipDurationSafe(c: { inMs: number; outMs: number; speed: number }): number { return (c.outMs - c.inMs) / c.speed; }
export default function App() { return <SafeAreaProvider><EditorApp /></SafeAreaProvider>; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  heading: { paddingTop: 13, paddingBottom: 28 },
  logo: { color: theme.text, fontSize: 36, fontWeight: '900', letterSpacing: -1.5 },
  eyebrow: { color: theme.muted, fontSize: 10, letterSpacing: 3, marginTop: 3 },
  hero: { backgroundColor: theme.surface, borderRadius: 20, padding: 22, gap: 15, marginBottom: 25, borderColor: theme.border, borderWidth: 1 },
  heroTitle: { color: theme.text, fontSize: 28, fontWeight: '900', letterSpacing: -.5, lineHeight: 32 },
  heroCopy: { color: theme.muted, fontSize: 13, lineHeight: 20 },
  tool: { backgroundColor: theme.raised, borderRadius: 9, minHeight: 35, paddingHorizontal: 11, justifyContent: 'center', alignItems: 'center', marginRight: 5, marginBottom: 5 },
  primaryTool: { backgroundColor: theme.accent },
  toolText: { color: theme.text, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 12, color: theme.text, fontWeight: '800', letterSpacing: 1.2 },
  meta: { fontSize: 11, color: theme.muted },
  empty: { textAlign: 'center', color: theme.muted, paddingVertical: 45 },
  projectCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, backgroundColor: theme.surface, borderRadius: 12, borderColor: theme.border, borderWidth: 1, marginBottom: 9 },
  projectThumbnail: { width: 56, height: 62, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#253042' },
  projectName: { color: theme.text, fontSize: 13, fontWeight: '800' },
  connect: { gap: 7, backgroundColor: theme.surface, borderRadius: 14, padding: 12 },
  editorBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 7 },
  previewContainer: { backgroundColor: '#05070B', borderRadius: 10, paddingVertical: 4, alignItems: 'center', overflow: 'hidden' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 5 },
  clock: { color: theme.text, fontSize: 12, fontWeight: '800' },
  toolsPanel: { padding: 12, backgroundColor: theme.surface, borderRadius: 12, marginTop: 11, marginBottom: 8, gap: 7 },
  disclaimer: { color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 16, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: '#000000CC', padding: 24 },
  modalPanel: { backgroundColor: theme.surface, borderRadius: 16, padding: 20, gap: 16 },
  field: { minHeight: 52, backgroundColor: theme.raised, color: theme.text, padding: 14, borderRadius: 8, fontSize: 16 },
  busy: { position: 'absolute', right: 25, top: 75 }
});
