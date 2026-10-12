import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { EditorRail, type EditorAction } from './src/ui/EditorRail';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { probeAudioDurationMs } from './src/media/audioProbe';
import { pickedMediaDurationMs } from './src/media/mediaDuration';
import { Directory, File, Paths } from 'expo-file-system';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AudioStage } from './src/ui/AudioStage';
import * as Sharing from 'expo-sharing';
import { addCaptionCues, groupRecognizedWords, mapWordsToTimeline,
  parseCaptions, restyleCaptions, captionsFromProject, serializeSrt,
  type CaptionPreset } from './src/domain/captions';
import { speechRecognitionAvailable, transcribeLocalVideo } from './src/media/speech';
import {proposeSpeechGaps,applyReviewedSpeechGaps,type SpeechGap} from './src/domain/speechGapReview';
import {analyzeCreatorProject} from './src/domain/creatorReview';
import {CreatorReviewSheet} from './src/ui/CreatorReviewSheet';
import {SpeechGapReviewSheet} from './src/ui/SpeechGapReviewSheet';
import {StoryFinderSheet} from './src/ui/StoryFinderSheet';
import {proposeStoryMoments,createStoryShort,type StoryMoment} from './src/domain/storyMoments';
import { splitCaption, mergeCaptionWithNext, nudgeCaption, shiftAllCaptions,
  fixSentenceCase } from './src/domain/captionEditing';
import { replaceCaptionPhrase } from './src/domain/captionReplace';
import { canExportNatively, exportMp4, shareExport } from './src/export/native';
import { addAsset, addText, activeClip, createProject, durationMs, editClip, makeId, moveClip, Project, removeClip, removeText, reorderClip, splitClip, rippleTrimClip, rippleDeleteClip, restoreHistorySnapshot, editTextLayer, rippleSpeedClip, duplicateProject, duplicateClip, setClipSourceEdge } from './src/domain/timeline';
import { loadLocalProjects, saveLocalProjects } from './src/data/storage';
import { loadRemoteProjects, saveProjectToSheets, softDeleteProjectFromSheets } from './src/data/sheets';
import { reconcileCloudProjects } from './src/data/cloudReconcile';
import { VideoStage } from './src/ui/VideoStage';
import { Timeline } from './src/ui/Timeline';
import { theme } from './src/ui/theme';
import { LOOKS, LOOK_ORDER, resolveLook } from './src/domain/looks';
import { setProjectLook } from './src/domain/timeline';
import { generateCaptionsFromScript } from './src/domain/captionGenerator';
import { SPEECH_LANGUAGES, type SpeechLanguage } from './src/domain/speechLanguages';
import { SocialStudio } from './src/ui/SocialStudio';
import {CloudWorkspace} from './src/ui/CloudWorkspace';
import {HelpDesk} from './src/ui/HelpDesk';
import {restoreCloudSession,type CloudSession} from './src/cloud/account';
import {backUpCloudProject} from './src/cloud/transfer';

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
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [helpOpen,setHelpOpen]=useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seekVersion, setSeekVersion] = useState(0);
  const [textPrompt, setTextPrompt] = useState(false);
  const [editTextPrompt, setEditTextPrompt] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [namePrompt, setNamePrompt] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(355);
  const [exportQuality, setExportQuality] = useState<720 | 1080>(1080);
  const [fullPreview, setFullPreview] = useState(false);
  const [captionPanelOpen, setCaptionPanelOpen] = useState(false);
  const [captionFindOpen,setCaptionFindOpen]=useState(false);
  const [captionFind,setCaptionFind]=useState('');
  const [captionReplace,setCaptionReplace]=useState('');
  const [creatorReviewOpen,setCreatorReviewOpen]=useState(false);
  const [storyFinderOpen,setStoryFinderOpen]=useState(false);
  const [storySuggestions,setStorySuggestions]=useState<StoryMoment[]>([]);
  const [storySourceRevision,setStorySourceRevision]=useState<number|null>(null);
  const [advancedToolsOpen,setAdvancedToolsOpen]=useState(false);
  const [speechReviewVisible,setSpeechReviewVisible]=useState(false);
  const [speechReview,setSpeechReview]=useState<{
    clipId:string;revision:number;cuts:SpeechGap[];selectedIds:Set<string>;
  } | null>(null);
  const [socialOpen, setSocialOpen] = useState(false);
  const [youtubeToken, setYoutubeToken] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  const [captionScript, setCaptionScript] = useState('');
  const [scriptWords, setScriptWords] = useState(5);
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage>('en-US');
  const [preciseTrimOpen, setPreciseTrimOpen] = useState(false);
  const [captionStylesOpen, setCaptionStylesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const voiceRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recordingState = useAudioRecorderState(voiceRecorder, 250);
  const voiceoverStart = useRef(0);
  const recordingLock = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [cloudSession,setCloudSession]=useState<CloudSession|null>(null);
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
  // Separate, user-consented OAuth scope for YouTube uploads.
  // Tokens remain in memory, never written into Google Sheets or project files.
  const [, youtubeResponse, youtubePromptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS || 'not-configured.apps.googleusercontent.com',
    androidClientId: GOOGLE_ANDROID || 'not-configured.apps.googleusercontent.com',
    webClientId: GOOGLE_WEB || 'not-configured.apps.googleusercontent.com',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/youtube.upload'],
    selectAccount: true
  });
  useEffect(() => {
    if (youtubeResponse?.type === 'success' && youtubeResponse.authentication?.accessToken)
      setYoutubeToken(youtubeResponse.authentication.accessToken);
    else if (youtubeResponse?.type === 'error') setYoutubeToken(null);
  }, [youtubeResponse]);
  // A failed library load must NEVER initialize the editor with an empty
  // project list, as doing so would immediately overwrite recoverable data.
  const reloadLibrary = async () => {
    setLoadFailure(null);
    try {
      const recovered = await loadLocalProjects();
      setProjects(recovered);
      setReady(true);
    } catch (e) {
      setReady(false);
      setLoadFailure(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => { void reloadLibrary(); }, []);
  useEffect(()=>{
    let alive=true;
    restoreCloudSession().then(account=>{if(alive)setCloudSession(account);})
      .catch(()=>{if(alive)setCloudSession(null);});
    return()=>{alive=false;};
  },[]);
  useEffect(() => {
    if (!ready || loadFailure) return;
    writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
      await saveLocalProjects(projects);
      setSaveFailure(null);
    });
    writeQueue.current.catch(e => {
      setSaveFailure(e instanceof Error ? e.message : String(e));
    });
  }, [ready, projects, loadFailure]);
  const retrySave = async () => {
    try {
      await writeQueue.current.catch(() => {});
      await saveLocalProjects(projects);
      setSaveFailure(null);
    } catch (e) {
      setSaveFailure(e instanceof Error ? e.message : String(e));
    }
  };
  const project = projects.find(p => p.id === editingId) ?? null;
  const selected = project?.clips.find(c => c.id === selectedId) ?? null;
  const selectedText = project?.texts.find(t => t.id === selectedTextId) ?? null;
  const total = project ? durationMs(project) : 0;
  const creatorReport = useMemo(() =>
    project ? analyzeCreatorProject(project,Platform.OS==='android'?'android':'ios',exportQuality) : null,
    [project,exportQuality]);
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
    setLastExport(null);
    undo.current.push(project);
    if (undo.current.length > 50) undo.current.shift();
    redo.current = [];
    setProjects(existing => existing.map(p => p.id === project.id ? updated : p));
  };
  const undoAction = () => {
    if (!project) return;
    const prior = undo.current.pop(); if (!prior) return;
    redo.current.push(project);
    setLastExport(null);
    setProjects(existing => existing.map(p => p.id === project.id ? restoreHistorySnapshot(project, prior) : p));
  };
  const redoAction = () => {
    if (!project) return;
    const next = redo.current.pop(); if (!next) return;
    undo.current.push(project);
    setLastExport(null);
    setProjects(existing => existing.map(p => p.id === project.id ? restoreHistorySnapshot(project, next) : p));
  };
  const seek = (ms: number) => { setPlaying(false); setPositionMs(Math.max(0, Math.min(total, ms))); setSeekVersion(v => v + 1); };
  const openProject = (p: Project) => {
    setEditingId(p.id); setSelectedId(null); setSelectedTextId(null); setPositionMs(0); setPlaying(false); setLastExport(null); setTimelineZoom(1);
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
        durationMs: pickedMediaDurationMs(item.type === 'video' ? 'video' : 'image', item.duration),
        width: item.width || 0, height: item.height || 0
      })));
      apply(p => assets.reduce((current, asset) => addAsset(current, asset), p));
    } catch (error) { Alert.alert('Import failed', String(error)); }
    finally { setBusy(false); }
  };
  const toggleVoiceover = async () => {
    if (!project || recordingLock.current) return;
    recordingLock.current = true;
    try {
      if (!recordingState.isRecording) {
        setPlaying(false);
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error('Microphone permission was not granted.');
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        voiceoverStart.current = positionMs;
        await voiceRecorder.prepareToRecordAsync();
        voiceRecorder.record();
      } else {
        await voiceRecorder.stop();
        const uri = voiceRecorder.uri;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
        if (!uri) throw new Error('Microphone recorded no audio file.');
        const recordedUri = await savedMedia(uri, 'voiceover.m4a');
        const duration = await probeAudioDurationMs(recordedUri);
        const asset = { id: makeId(), uri: recordedUri, kind: 'audio' as const,
          filename: 'Voiceover.m4a', durationMs: duration, width: 0, height: 0 };
        apply(p => addAsset(p, asset, 'audio', voiceoverStart.current));
      }
    } catch (e) {
      Alert.alert('Voiceover', e instanceof Error ? e.message : String(e));
    } finally { recordingLock.current = false; }
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


  const removeLongPauses = async () => {
    if (!project || busy) return;
    setCaptionPanelOpen(false);
    const clip=(selected?.track==='video'?selected:undefined) ||
      activeClip(project,positionMs) || project.clips.find(c=>c.track==='video');
    const asset=project.assets.find(a=>a.id===clip?.assetId);
    if(!clip || asset?.kind!=='video'){
      Alert.alert('Choose talking-head footage','Select a video clip before reviewing speech gaps.');
      return;
    }
    if(project.texts.length || project.clips.some(c=>c.track==='audio')){
      Alert.alert('Protect timing first',
        'Review speech cuts before adding captions, music or independent audio. Duplicate this project if you want to experiment.');
      return;
    }
    if(speechReview?.clipId===clip.id && speechReview.revision===project.revision){
      setSpeechReviewVisible(true);return;
    }
    if(!speechRecognitionAvailable()){
      Alert.alert('iPhone development build required',
        'Speech-gap suggestions currently need offline iPhone transcription. No recording or audio is uploaded to a server.');
      return;
    }
    setBusy(true);
    try {
      const words=await transcribeLocalVideo(asset.uri,speechLanguage);
      const suggestions=proposeSpeechGaps(clip,words);
      if(!suggestions.length) {
        Alert.alert('No editable speech gaps found',
          'No long gaps were suggested between recognized words. Laughter, silence and reactions were not measured directly.');
        return;
      }
      setSpeechReview({clipId:clip.id,revision:project.revision,
        cuts:suggestions,selectedIds:new Set<string>()});
      setSpeechReviewVisible(true);
    } catch(e){Alert.alert('Speech-gap review unavailable',e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const approveSpeechCuts=()=>{
    if(!project||!speechReview||!speechReview.selectedIds.size)return;
    if(speechReview.revision!==project.revision) {
      setSpeechReviewVisible(false);setSpeechReview(null);
      Alert.alert('Rescan required','Your timeline changed. Scan again before applying cuts.');
      return;
    }
    try{
      apply(p=>applyReviewedSpeechGaps(p,speechReview.clipId,speechReview.cuts,speechReview.selectedIds));
      setSpeechReviewVisible(false);setSpeechReview(null);
      Alert.alert('Approved cuts applied','Your cut choices were added as one reversible edit. Use Undo to restore the original.');
    }catch(e){Alert.alert('Cannot apply cuts',e instanceof Error?e.message:String(e));}
  };
  const replaceCaptionWords=()=>{
    if(!project)return;
    try{
      const result=replaceCaptionPhrase(project,captionFind,captionReplace);
      if(!result.count){Alert.alert('No matches','This text was not found in spoken captions.');return;}
      apply(()=>result.project);
      setCaptionFindOpen(false);
      Alert.alert('Transcript updated',result.count+
        ' occurrence(s) corrected. Original timing and text styles were kept. Undo restores the original.');
    }catch(e){Alert.alert('Replace failed',e instanceof Error?e.message:String(e));}
  };
  const generateFromScript = () => {
    if(!project)return;
    try {
      const limit = Math.max(0,...project.clips.filter(c=>c.track==='video').map(c=>c.startMs+clipDurationSafe(c)));
      if(limit<=0)throw Error('Import a video before generating timed captions.');
      const cues=generateCaptionsFromScript(captionScript,0,limit,scriptWords);
      apply(p=>addCaptionCues(p,cues,'punch'));
      setScriptPanelOpen(false);
      Alert.alert('Script captions added',cues.length+
        ' editable caption groups were distributed across the video. Timing is estimated, not speech-recognized; review synchronization before export.');
    } catch(e) { Alert.alert('Script generator',e instanceof Error?e.message:String(e)); }
  };
  const importSubtitles = async () => {
    if (!project) return;
    setCaptionPanelOpen(false);
    try {
      const chosen = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (chosen.canceled) return;
      const picked = chosen.assets[0];
      if (!/\.(srt|vtt)$/i.test(picked.name))
        throw new Error('Please select a .srt or .vtt subtitle file.');
      setBusy(true);
      const content = await new File(picked.uri).text();
      const cues = parseCaptions(content);
      if (!cues.length) throw new Error('No valid subtitles found. Check the file timestamps.');
      apply(p => addCaptionCues(p, cues, 'classic'));
      Alert.alert('Subtitles imported', cues.length + ' timed captions added. Tap an orange caption in the timeline to edit it.');
    } catch (e) { Alert.alert('Subtitle import failed', String(e)); }
    finally { setBusy(false); }
  };
  const generateAutoCaptions = async (allClips = false) => {
    if(!project || busy)return;
    setCaptionPanelOpen(false);
    if(!speechRecognitionAvailable()){
      Alert.alert('iPhone development build required',
        'Offline speech recognition currently requires VIDNIVO on iPhone. Script captions and imported subtitles work on Android and iPhone.');
      return;
    }
    const selectedVideo=selected?.track==='video'?selected:
      activeClip(project,positionMs) || project.clips.find(c=>c.track==='video');
    const videos=allClips ?
      project.clips.filter(c=>c.track==='video').sort((a,b)=>a.startMs-b.startMs) :
      selectedVideo?[selectedVideo]:[];
    if(!videos.length) {Alert.alert('Add a video first','Choose footage to transcribe.');return;}
    if(videos.length>30){Alert.alert('Too many clips','Generate captions in batches of up to 30 video clips.');return;}
    setBusy(true);
    try {
      const cache=new Map<string,Awaited<ReturnType<typeof transcribeLocalVideo>>>();
      const captions: ReturnType<typeof groupRecognizedWords> = [];
      for(const clip of videos){
        const asset=project.assets.find(a=>a.id===clip.assetId);
        if(!asset || asset.kind!=='video')continue;
        let words=cache.get(asset.uri);
        if(!words){words=await transcribeLocalVideo(asset.uri,speechLanguage);cache.set(asset.uri,words);}
        captions.push(...groupRecognizedWords(mapWordsToTimeline(words,clip),scriptWords));
      }
      if(!captions.length)throw Error('No speech was detected in this footage.');
      if(captions.length>500)throw Error('This will create more than 500 captions. Choose a larger words-per-caption setting and try again.');
      apply(p=>addCaptionCues(p,captions,'punch'));
      Alert.alert('Captions generated',captions.length+
        ' timed caption groups were created locally. Review every caption before sharing.');
    }catch(e){Alert.alert('Caption generation failed',String(e));}
    finally{setBusy(false);}
  };
  const exportSubtitleFile = async () => {
    if (!project) return;
    setCaptionPanelOpen(false);
    if (!project.texts.length) {
      Alert.alert('No captions yet', 'Add text, import a subtitle file, or generate captions first.'); return;
    }
    try {
      const target = new File(Paths.cache, 'vidnivo-' + project.id + '-captions.srt');
      target.create({ overwrite: true });
      target.write(serializeSrt(captionsFromProject(project)));
      if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is not available.');
      await Sharing.shareAsync(target.uri, { mimeType: 'application/x-subrip',
        dialogTitle: 'Share VIDNIVO subtitles' });
    } catch (e) { Alert.alert('Subtitle export failed', String(e)); }
  };
  const applyCaptionStyle = (preset: CaptionPreset) => {
    if (project?.texts.length) apply(p => restyleCaptions(p, preset));
    else Alert.alert('No captions yet', 'Add captions before selecting a style.');
    setCaptionStylesOpen(false);
    setCaptionPanelOpen(false);
  };
  const renderVideo = async () => {
    if (!project) return;
    const audit=analyzeCreatorProject(project,Platform.OS==='android'?'android':'ios',exportQuality);
    if(!audit.canExport){setCreatorReviewOpen(true);return;}
    try {
      setPlaying(false); setBusy(true);
      const uri = await exportMp4(project, exportQuality);
      setLastExport(uri);
      Alert.alert('Video exported', 'Your MP4 is ready to share.', [
        { text: 'Done' },
        { text: 'Share', onPress: () => { void shareExport(uri).catch(err => Alert.alert('Could not share', String(err))); } }
      ]);
    } catch (e) {
      Alert.alert('Export unavailable', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const showStoryFinder=()=>{
    if(!project)return;
    try{
      const found=proposeStoryMoments(project);
      setStorySuggestions(found);
      setStorySourceRevision(project.revision);
      setPlaying(false);
      setStoryFinderOpen(true);
    }catch(e){Alert.alert('Story Finder',e instanceof Error?e.message:String(e));}
  };
  const createShortFromMoment=(moment:StoryMoment)=>{
    if(!project)return;
    if(storySourceRevision!==project.revision){
      Alert.alert('Review again','The project changed since these moments were proposed. Scan it again.');
      setStoryFinderOpen(false);
      return;
    }
    try{
      const draft=createStoryShort(project,moment);
      setProjects(items=>[draft,...items]);
      setStoryFinderOpen(false);
      openProject(draft);
      Alert.alert('Editable short created',
        'Your source project was preserved. Check the cuts, captions and audio before exporting.');
    }catch(e){Alert.alert('Could not create short',e instanceof Error?e.message:String(e));}
  };
  const duplicateSavedProject = (source: Project) => {
    const copy=duplicateProject(source);
    setProjects(items=>[copy,...items]);
    Alert.alert('Project duplicated', 'The new draft uses the same local media files. Original edits remain unchanged.');
  };
  const deleteProject = (p: Project) => {
    Alert.alert('Delete project?', 'This removes the project and its edits from VIDNIVO. Imported media files remain on the device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          setBusy(true);
          if (token) await softDeleteProjectFromSheets(token, p.id);
          setProjects(existing => existing.filter(item => item.id !== p.id));
        } catch (e) {
          Alert.alert('Cannot delete cloud project', 'Local project retained because remote removal failed: ' + String(e));
        } finally { setBusy(false); }
      } }
    ]);
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
      // Google Sheets saves project metadata only. A newer remote revision
      // must not replace a good local project with another phone's dead URIs.
      const reconciliation = reconcileCloudProjects(projects,remote,uri=>{
        try { return uri.startsWith('file://') && new File(uri).exists; }
        catch { return false; }
      });
      setProjects(reconciliation.projects);
      const skipped = reconciliation.skipped.length
        ? '\\n' + reconciliation.skipped.length +
          ' cloud project(s) skipped: media files are not on this device. Local projects were kept. Use the original phone or re-import media.'
        : '';
      Alert.alert('Google Sheets synced',`${remote.length} cloud projects found. ${reconciliation.applied} newer or missing projects were imported.`+skipped);
    } catch (e) { Alert.alert('Cloud sync failed', String(e)); }
    finally { setBusy(false); }
  };
  const backupActiveProject=async()=>{
    if(!project||!cloudSession||busy)return;
    const snapshot=project;
    try{
      setBusy(true);
      const version=await backUpCloudProject(snapshot);
      setProjects(items=>items.map(p=>p.id===snapshot.id &&
        (p.cloudVersion??0)===(snapshot.cloudVersion??0)?
        {...p,cloudVersion:version}:p));
      Alert.alert('VIDNIVO backup complete',
        'Your full project and original media are in your private account.');
    }catch(e){
      Alert.alert('Cloud backup not completed',
        (e instanceof Error?e.message:String(e))+
        '\nThe project remains safe on this phone. A cloud conflict requires restoring a separate copy.');
    }finally{setBusy(false);}
  };
  if (loadFailure) return <View style={[styles.center, { padding: 24 }]}>
    <Ionicons name="warning-outline" size={42} color="#F79B6D" />
    <Text style={[styles.projectName, { textAlign: 'center', marginTop: 18 }]}>Cannot safely open your projects</Text>
    <Text style={[styles.meta, { textAlign: 'center', marginTop: 12, lineHeight: 19 }]}>
      {loadFailure}
    </Text>
    <Text style={[styles.meta, { textAlign: 'center', marginTop: 10, lineHeight: 19 }]}>
      Your projects have not been erased or overwritten. Do not uninstall the application.
    </Text>
    <Tool label="Try recovery again" primary onPress={() => { void reloadLibrary(); }} />
  </View>;
  if (!ready) return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  if (!project) return <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
    {saveFailure ? <Pressable accessibilityRole="button" onPress={() => { void retrySave(); }}
      style={{ backgroundColor: '#653335', padding: 12, borderRadius: 10 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
        Local save failed — tap to retry. Keep the app open. {saveFailure}
      </Text>
    </Pressable> : null}
    <View style={styles.heading}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
        <Text style={styles.logo}>VID<Text style={{color:theme.accent}}>NIVO</Text></Text>
        <Tool label="Help" onPress={()=>setHelpOpen(true)}/>
      </View>
      <Text style={styles.eyebrow}>MOBILE VIDEO STUDIO</Text>
    </View>
    <View style={styles.hero}><Text style={styles.heroTitle}>Make something worth watching.</Text><Text style={styles.heroCopy}>Cut video, arrange your timeline, add captions, and keep projects on your phone.</Text><Tool label="+ New project" primary onPress={create} /></View>
    <View style={styles.row}><Text style={styles.section}>YOUR PROJECTS</Text><Text style={styles.meta}>{projects.length} saved</Text></View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      {projects.length === 0 && <Text style={styles.empty}>Create a project to start editing.</Text>}
      {projects.map(p => <View key={p.id} style={styles.projectCard}>
        <Pressable onPress={() => openProject(p)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.projectThumbnail}><Text style={{ fontSize: 25, color: theme.accent }}>▶</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.projectName}>{p.name}</Text><Text style={styles.meta}>{p.aspectRatio} · {fmt(durationMs(p))} · {p.clips.length} clips</Text></View>
        </Pressable>
        <Tool label="Copy" disabled={busy} onPress={() => duplicateSavedProject(p)} />
        <Tool label="Delete" disabled={busy} onPress={() => deleteProject(p)} />
      </View>)}
      <CloudWorkspace session={cloudSession} setSession={setCloudSession}
        setProjects={setProjects}/>
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
    <HelpDesk visible={helpOpen} onClose={()=>setHelpOpen(false)}
      project={null} cloudConnected={!!cloudSession} saveFailed={!!saveFailure}
      exportSupported={canExportNatively()} quality={exportQuality}
      onRetrySave={retrySave} onRestartPreview={()=>{
        setPlaying(false);setPositionMs(0);setSeekVersion(v=>v+1);
      }} onLowerExportQuality={()=>setExportQuality(720)}/>
    <StatusBar style="light" />
  </View>;

  const comingSoon = (feature: string) =>
    Alert.alert(feature + ' — coming soon', 'This tool is not implemented yet. It will only appear as an editing action when its result can be previewed and exported reliably.');
  const showRatioMenu = () =>
    Alert.alert('Canvas ratio', 'Choose an aspect ratio.', [
      ...(['9:16','16:9','1:1'] as const).map(ratio => ({
        text: ratio + (project.aspectRatio === ratio ? ' ✓' : ''),
        onPress: () => apply(p => ({ ...p, aspectRatio: ratio,
          updatedAt: new Date().toISOString(), revision: p.revision + 1 }))
      })),
      { text: 'Cancel', style: 'cancel' as const }
    ]);
  const showExportMenu = () =>
    Alert.alert('Export resolution', 'Choose your MP4 export quality.', [
      { text: '720p', onPress: () => setExportQuality(720) },
      { text: '1080p', onPress: () => setExportQuality(1080) },
      { text: 'Cancel', style: 'cancel' }
    ]);
  const findInProject = (value: string) => {
    const query = value.toLowerCase().trim();
    if (!query) return [];
    return [
      ...project.clips.filter(c => project.assets.find(a => a.id === c.assetId)?.filename.toLowerCase().includes(query))
        .map(c => ({ id: c.id, type: 'clip' as const, title: project.assets.find(a => a.id === c.assetId)?.filename || 'Clip', at: c.startMs })),
      ...project.texts.filter(t => t.text.toLowerCase().includes(query))
        .map(t => ({ id: t.id, type: 'text' as const, title: t.text, at: t.startMs }))
    ];
  };
  const clipActions: EditorAction[] = selected ? [
    { id: 'back', label: 'Done', icon: 'arrow-back', onPress: () => setSelectedId(null) },
    { id: 'split', label: 'Split', icon: 'cut-outline', onPress: () => apply(p => splitClip(p, selected.id, positionMs)) },
    { id: 'precision', label: 'Precision', icon: 'options-outline',
      onPress: () => { setPlaying(false); setPreciseTrimOpen(true); } },
    { id: 'trim-left', label: 'Trim start', icon: 'play-back-outline', onPress: () => apply(p => rippleTrimClip(p, selected.id, 'left', 500)) },
    { id: 'trim-right', label: 'Trim end', icon: 'play-forward-outline', onPress: () => apply(p => rippleTrimClip(p, selected.id, 'right', -500)) },
    { id: 'looks', label: 'Looks', icon: 'color-filter-outline',
      onPress: () => setFilterPanelOpen(true) },
    { id: 'duplicate', label: 'Duplicate', icon: 'duplicate-outline',
      onPress: () => apply(p => duplicateClip(p, selected.id)) },
    { id: 'before', label: 'Earlier', icon: 'arrow-back-circle-outline', onPress: () => apply(p => reorderClip(p, selected.id, -1)) },
    { id: 'after', label: 'Later', icon: 'arrow-forward-circle-outline', onPress: () => apply(p => reorderClip(p, selected.id, 1)) },
    { id: 'slow', label: '0.5×', icon: 'speedometer-outline', onPress: () => apply(p => rippleSpeedClip(p, selected.id, .5)) },
    { id: 'normal', label: '1×', icon: 'speedometer-outline', onPress: () => apply(p => rippleSpeedClip(p, selected.id, 1)) },
    { id: 'fast', label: '2×', icon: 'flash-outline', onPress: () => apply(p => rippleSpeedClip(p, selected.id, 2)) },
    { id: 'mute', label: selected.muted ? 'Unmute' : 'Mute', icon: selected.muted ? 'volume-high-outline' : 'volume-mute-outline',
      onPress: () => apply(p => editClip(p, selected.id, { muted: !selected.muted })) },
    { id: 'delete', label: 'Delete', icon: 'trash-outline', onPress: () => {
      apply(p => rippleDeleteClip(p, selected.id)); setSelectedId(null);
    }}
  ] : [];
  const textActions: EditorAction[] = selectedText ? [
    { id: 'back', label: 'Done', icon: 'arrow-back', onPress: () => setSelectedTextId(null) },
    { id: 'edit', label: 'Edit', icon: 'create-outline', onPress: () => { setTitleText(selectedText.text); setEditTextPrompt(true); } },
    { id: 'bigger', label: 'Larger', icon: 'add-circle-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { fontSize: selectedText.fontSize + 4 })) },
    { id: 'smaller', label: 'Smaller', icon: 'remove-circle-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { fontSize: selectedText.fontSize - 4 })) },
    { id: 'up', label: 'Move up', icon: 'arrow-up-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { y: selectedText.y - .05 })) },
    { id: 'down', label: 'Move down', icon: 'arrow-down-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { y: selectedText.y + .05 })) },
    { id: 'splitText', label: 'Split text', icon: 'git-branch-outline',
      onPress: () => apply(p => splitCaption(p, selectedText.id)) },
    { id: 'mergeText', label: 'Merge next', icon: 'git-merge-outline',
      onPress: () => apply(p => mergeCaptionWithNext(p, selectedText.id)) },
    { id: 'nudgeLeft', label: '−0.1s', icon: 'arrow-back-outline',
      onPress: () => apply(p => nudgeCaption(p, selectedText.id, -100)) },
    { id: 'nudgeRight', label: '+0.1s', icon: 'arrow-forward-outline',
      onPress: () => apply(p => nudgeCaption(p, selectedText.id, 100)) },
    { id: 'longer', label: 'Extend', icon: 'resize-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { endMs: selectedText.endMs + 500 })) },
    { id: 'shorter', label: 'Shorten', icon: 'contract-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { endMs: selectedText.endMs - 500 })) },
    { id: 'white', label: 'White', icon: 'color-palette-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { color: '#FFFFFF' })) },
    { id: 'cyan', label: 'Cyan', icon: 'color-palette-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { color: '#23D4E9' })) },
    { id: 'yellow', label: 'Yellow', icon: 'color-palette-outline', onPress: () => apply(p => editTextLayer(p, selectedText.id, { color: '#FFDD57' })) },
    { id: 'delete', label: 'Delete', icon: 'trash-outline', onPress: () => { apply(p => removeText(p, selectedText.id)); setSelectedTextId(null); } }
  ] : [];
  // Keep the everyday tools discoverable, with infrequent operations under More.
  // All visible actions are implemented; avoid exposing placeholders in primary UI.
  const advancedActions: EditorAction[]=[
    {id:'add-media',label:'Import photos/video',icon:'albums-outline',onPress:importVisual},
    {id:'voiceover',label:recordingState.isRecording?'Stop recording':'Record voiceover',
      icon:recordingState.isRecording?'stop-circle-outline':'mic-outline',onPress:toggleVoiceover},
    {id:'ratio',label:'Aspect ratio',icon:'crop-outline',onPress:showRatioMenu},
    {id:'zoom',label:'Zoom timeline in',icon:'add-circle-outline',
      disabled:timelineZoom>=3,onPress:()=>setTimelineZoom(z=>Math.min(3,z+.5))},
    {id:'zoom-out',label:'Zoom timeline out',icon:'remove-circle-outline',
      disabled:timelineZoom<=.5,onPress:()=>setTimelineZoom(z=>Math.max(.5,z-.5))},
    {id:'save',label:'Save to Google Sheets',icon:'cloud-upload-outline',
      disabled:!token,onPress:cloudSave},
    {id:'cloud-backup',label:'Back up project + media',icon:'cloud-done-outline',
      disabled:!cloudSession||busy,onPress:()=>{void backupActiveProject();}},
    {id:'speech',label:'Review talking-head cuts',icon:'cut-outline',
      onPress:()=>{void removeLongPauses();}},
    {id:'story',label:'Story Finder',icon:'sparkles-outline',onPress:showStoryFinder}
  ];
  const baseActions: EditorAction[]=[
    {id:'edit',label:'Edit',icon:'cut-outline',onPress:()=>{
      const clip=activeClip(project,positionMs)||project.clips.find(c=>c.track==='video');
      if(clip)setSelectedId(clip.id);else void importVisual();
    }},
    {id:'captions',label:'Captions',icon:'chatbox-ellipses-outline',onPress:()=>setCaptionPanelOpen(true)},
    {id:'audio',label:'Audio',icon:'musical-notes-outline',onPress:importAudio},
    {id:'text',label:'Text',icon:'text-outline',onPress:()=>{setTitleText('');setTextPrompt(true);}},
    {id:'looks',label:'Looks',icon:'color-filter-outline',onPress:()=>setFilterPanelOpen(true)},
    {id:'social',label:'Social',icon:'share-social-outline',
      onPress:()=>{setPlaying(false);setSocialOpen(true);}},
    {id:'review',label:'Review',icon:'checkmark-done-outline',
      onPress:()=>{setPlaying(false);setCreatorReviewOpen(true);}},
    {id:'more',label:'More',icon:'ellipsis-horizontal-circle-outline',
      onPress:()=>setAdvancedToolsOpen(true)}
  ];
  return <View style={[styles.editorScreen, { paddingTop: insets.top + 4, paddingBottom: insets.bottom }]}>
    {saveFailure ? <Pressable accessibilityRole="button" onPress={() => { void retrySave(); }}
      style={{ backgroundColor: '#653335', padding: 9, borderRadius: 8 }}>
      <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>
        Draft not saved. Tap to retry before leaving.
      </Text>
    </Pressable> : null}
    <View style={styles.mobileHeader}>
      <Pressable accessibilityLabel="Back to projects" accessibilityRole="button"
        disabled={recordingState.isRecording}
        onPress={() => { setEditingId(null); setPlaying(false); }}
        style={styles.headerIcon}><Ionicons name="close" size={29} color="#EBEDF0" /></Pressable>
      <Pressable accessibilityLabel="Search clips and text" accessibilityRole="button"
        onPress={() => { setSearchTerm(''); setSearchOpen(true); }} style={styles.headerIcon}>
        <Ionicons name="search-outline" size={25} color="#E9EBED" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Help troubleshoot VIDNIVO"
        onPress={()=>setHelpOpen(true)} style={styles.headerIcon}>
        <Ionicons name="help-circle-outline" size={25} color="#E9EBED"/>
      </Pressable>
      <Pressable style={styles.headerProject} onPress={() => { setProjectName(project.name); setNamePrompt(true); }}>
        <Text style={styles.headerProjectText} numberOfLines={1}>{project.name}</Text>
      </Pressable>
      <Pressable style={styles.qualityButton} accessibilityRole="button"
        accessibilityLabel="Choose export quality" onPress={showExportMenu}>
        <Text style={styles.qualityLabel}>{exportQuality}P</Text>
        <Ionicons name="chevron-down" size={14} color="#F6F7F8" />
      </Pressable>
      <Pressable style={[styles.exportButton, busy && { opacity: .65 }]}
        accessibilityRole="button" disabled={busy}
        onPress={() => {
          if (!canExportNatively()) Alert.alert('Development build required',
            'Install a VIDNIVO native development build to export MP4. Expo Go does not contain the native encoder.');
          else void renderVideo();
        }}>
        <Text style={styles.exportText}>Export</Text>
      </Pressable>
    </View>

    <View style={styles.mobileCanvas} onLayout={e => setCanvasHeight(e.nativeEvent.layout.height)}>
      <View style={styles.canvasCenter}>
        <VideoStage project={project} playheadMs={positionMs} playing={playing} seekVersion={seekVersion} maxHeight={Math.max(110, canvasHeight - 8)} />
        <AudioStage project={project} playheadMs={positionMs} playing={playing} seekVersion={seekVersion} />
      </View>
    </View>

    <View style={styles.mobileTransport}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fullscreen video preview"
        onPress={() => { setPlaying(false); setFullPreview(true); }} style={styles.transportSide}>
        <Ionicons name="expand-outline" color="#D3D5D7" size={23} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause playback' : 'Play'}
        onPress={() => { if (total > 0) { if (positionMs >= total) seek(0); setPlaying(v => !v); } }}
        style={styles.playControl}>
        <Ionicons name={playing ? 'pause' : 'play-outline'} size={30} color="#E8E9EA" />
      </Pressable>
      <View style={styles.transportRight}>
        <Pressable onPress={undoAction} accessibilityLabel="Undo" disabled={!undo.current.length}
          style={{ opacity: undo.current.length ? 1 : .3 }}>
          <Ionicons name="arrow-undo-outline" size={25} color="#C9CACD" /></Pressable>
        <Pressable onPress={redoAction} accessibilityLabel="Redo" disabled={!redo.current.length}
          style={{ opacity: redo.current.length ? 1 : .3 }}>
          <Ionicons name="arrow-redo-outline" size={25} color="#C9CACD" /></Pressable>
      </View>
    </View>

    <Timeline project={project} playheadMs={positionMs}
      selectedId={selectedId} selectedTextId={selectedTextId} zoom={timelineZoom}
      onSelect={(id, at) => {
        setSelectedId(id); setSelectedTextId(null);
        const clip = project.clips.find(c => c.id === id);
        if (clip && !(positionMs >= clip.startMs && positionMs < clip.startMs + clipDurationSafe(clip))) seek(at);
      }}
      onSelectText={(id, at) => { setSelectedTextId(id); setSelectedId(null); seek(at); }}
      onSeek={seek} onScrubStart={() => setPlaying(false)}
      onAddVideo={importVisual} onAddAudio={importAudio} />

    {selected ? <View style={styles.contextBar}>
      <Text style={styles.contextTitle}>CLIP  ·  {fmt(clipDurationSafe(selected))}  ·  {selected.speed}× SPEED</Text>
      <Text style={styles.contextVolume}>{selected.muted ? 'Muted' : 'Volume ' + Math.round(selected.volume * 100) + '%'}</Text>
      <Slider style={{ height: 20 }} minimumValue={0} maximumValue={1}
        step={.05} value={selected.volume} minimumTrackTintColor="#27D3E7"
        maximumTrackTintColor="#575B60" thumbTintColor="#27D3E7"
        onSlidingComplete={volume => apply(p => editClip(p, selected.id, { volume }))} />
      <Text style={styles.contextVolume}>Playback speed {selected.speed.toFixed(2)}×</Text>
      <Slider style={{ height: 23 }} minimumValue={.25} maximumValue={4}
        step={.25} value={selected.speed} minimumTrackTintColor="#27D3E7"
        maximumTrackTintColor="#575B60" thumbTintColor="#27D3E7"
        onSlidingComplete={speed => apply(p => rippleSpeedClip(p, selected.id, speed))} />
    </View> : null}
    {selectedText ? <View style={styles.contextBar}>
      <Text style={styles.contextTitle}>TEXT  ·  {selectedText.text}</Text>
      <Text style={styles.contextVolume}>{fmt(selectedText.startMs)} – {fmt(selectedText.endMs)}  ·  {selectedText.fontSize} pt</Text>
    </View> : null}
    {recordingState.isRecording ? <View style={styles.recordingBanner}>
      <Ionicons name="radio-button-on" size={17} color="#FF6875" />
      <Text style={styles.recordingBannerText}>Recording voiceover  {Math.round(recordingState.durationMillis / 1000)}s</Text>
    </View> : null}
    <EditorRail actions={selected ? clipActions : selectedText ? textActions : baseActions} />
    {lastExport ? <Pressable accessibilityRole="button" onPress={() => shareExport(lastExport).catch(e => Alert.alert('Sharing failed', String(e)))}
      style={styles.shareResult}><Text style={styles.shareResultText}>✓ MP4 ready — Share</Text></Pressable> : null}

    <HelpDesk visible={helpOpen} onClose={()=>setHelpOpen(false)}
      project={project} cloudConnected={!!cloudSession} saveFailed={!!saveFailure}
      exportSupported={canExportNatively()} quality={exportQuality}
      onRetrySave={retrySave} onRestartPreview={()=>{
        setPlaying(false);setPositionMs(0);setSeekVersion(v=>v+1);
      }} onLowerExportQuality={()=>setExportQuality(720)}/>
    <StoryFinderSheet visible={storyFinderOpen} moments={storySuggestions}
      onClose={()=>setStoryFinderOpen(false)}
      onPreview={m=>{
        setStoryFinderOpen(false);
        seek(m.startMs);
      }}
      onCreate={createShortFromMoment} />
    <CreatorReviewSheet visible={creatorReviewOpen} report={creatorReport!}
      busy={busy} onClose={()=>setCreatorReviewOpen(false)}
      onJump={(ms)=>seek(ms)}
      onExport={()=>{setCreatorReviewOpen(false);void renderVideo();}} />
    <SpeechGapReviewSheet visible={speechReviewVisible} cuts={speechReview?.cuts??[]}
      selected={speechReview?.selectedIds??new Set<string>()} busy={busy}
      onChange={id=>setSpeechReview(prev=>{
        if(!prev)return prev;
        const selectedIds=new Set(prev.selectedIds);
        if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);
        return {...prev,selectedIds};
      })}
      onSelectAll={()=>setSpeechReview(prev=>prev?{...prev,selectedIds:new Set(prev.cuts.map(c=>c.id))}:prev)}
      onClear={()=>setSpeechReview(prev=>prev?{...prev,selectedIds:new Set<string>()}:prev)}
      onPreview={candidate=>{
        setSpeechReviewVisible(false);
        seek(Math.max(0,candidate.timelineMs-500));
      }}
      onApply={approveSpeechCuts} onClose={()=>setSpeechReviewVisible(false)} />
    <Modal visible={advancedToolsOpen} animationType="slide" transparent
      onRequestClose={()=>setAdvancedToolsOpen(false)}>
      <View style={styles.captionBackdrop}>
        <View style={styles.captionSheet}>
          <View style={styles.row}>
            <Text style={styles.captionSheetTitle}>More editing tools</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close more tools"
              onPress={()=>setAdvancedToolsOpen(false)}>
              <Ionicons name="close" color="#F4F6FA" size={25}/>
            </Pressable>
          </View>
          <ScrollView style={{maxHeight:460}}>
            {advancedActions.map(action=><Pressable accessibilityRole="button" key={action.id}
              accessibilityLabel={action.label} disabled={action.disabled}
              style={[styles.captionChoice,action.disabled&&{opacity:.38}]}
              onPress={()=>{setAdvancedToolsOpen(false);action.onPress();}}>
              <Ionicons name={action.icon} color="#23D4E9" size={23}/>
              <Text style={styles.captionChoiceLabel}>{action.label}</Text>
            </Pressable>)}
          </ScrollView>
          <Text style={styles.trimHint}>
            Unavailable tools aren't displayed here as if they already work.
          </Text>
        </View>
      </View>
    </Modal>
    <SocialStudio visible={socialOpen} project={project} onClose={() => setSocialOpen(false)}
      exportUri={lastExport} exportVideo={() => { setSocialOpen(false); void renderVideo(); }}
      youtubeToken={youtubeToken} canConnectYouTube={configured}
      connectYouTube={() => {
        if (!configured) {
          Alert.alert('Google OAuth setup needed','Configure Google OAuth client IDs and enable YouTube Data API v3.');
          return;
        }
        void youtubePromptAsync();
      }} />
    <Modal visible={filterPanelOpen} animationType="slide" transparent onRequestClose={()=>setFilterPanelOpen(false)}>
      <View style={styles.captionBackdrop}>
        <View style={styles.captionSheet}>
          <View style={styles.row}>
            <Text style={styles.captionSheetTitle}>Colour looks</Text>
            <Pressable onPress={()=>setFilterPanelOpen(false)} accessibilityLabel="Close colour looks">
              <Ionicons name="close" color="#F3F4F6" size={25}/>
            </Pressable>
          </View>
          <Text style={styles.trimHint}>Apply a translucent colour grade across the entire video. Preview and export use the same tint and strength.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12,paddingVertical:14}}>
            {LOOK_ORDER.map(preset=><Pressable key={preset}
              accessibilityLabel={'Use '+LOOKS[preset].label+' colour look'}
              onPress={()=>apply(p=>setProjectLook(p,preset,project?.look?.intensity??75))}
              style={[styles.lookCard,
                (project.look?.preset??'none')===preset && {borderColor:'#23D4E9',borderWidth:2}]}>
              <View style={[styles.lookSwatch,{backgroundColor:LOOKS[preset].color}]}/>
              <Text numberOfLines={1} style={styles.lookName}>{LOOKS[preset].label}</Text>
            </Pressable>)}
          </ScrollView>
          <Text style={styles.trimTitle}>Intensity · {resolveLook(project.look).intensity}%</Text>
          <Slider style={{height:48}} minimumValue={0} maximumValue={100}
            step={5} value={resolveLook(project.look).intensity}
            minimumTrackTintColor="#23D4E9" maximumTrackTintColor="#70777F" thumbTintColor="#23D4E9"
            onSlidingComplete={v=>apply(p=>setProjectLook(p,resolveLook(p.look).preset,v))}/>
          <Pressable style={styles.trimDone} onPress={()=>setFilterPanelOpen(false)}>
            <Text style={styles.trimDoneText}>Apply look</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={scriptPanelOpen} animationType="slide" onRequestClose={()=>setScriptPanelOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
        style={[styles.searchPage,{paddingTop:insets.top+18,paddingBottom:insets.bottom+18}]}>
        <View style={styles.row}>
          <Text style={styles.captionSheetTitle}>Script caption generator</Text>
          <Pressable onPress={()=>setScriptPanelOpen(false)} accessibilityLabel="Close script generator">
            <Ionicons name="close" color="white" size={25}/>
          </Pressable>
        </View>
        <Text style={styles.trimHint}>Paste your script. VIDNIVO estimates timings across the video, creates editable timed subtitles, and lets you correct them afterward. This is not speech recognition.</Text>
        <TextInput multiline value={captionScript} onChangeText={setCaptionScript}
          placeholder="Enter or paste your spoken script…"
          placeholderTextColor="#7F8992"
          style={styles.scriptInput} textAlignVertical="top"/>
        <Text style={styles.trimTitle}>Words per caption</Text>
        <View style={styles.trimRow}>
          {[1,3,5,7].map(n=><Tool key={n} label={n===1?'Word mode':n+' words'} primary={n===scriptWords}
            onPress={()=>setScriptWords(n)}/>)}
        </View>
        <Text style={styles.trimHint}>Preview duration: {(Math.max(0,...project.clips.filter(c=>c.track==='video')
          .map(c=>c.startMs+clipDurationSafe(c)))/1000).toFixed(1)} seconds</Text>
        <Pressable style={styles.trimDone} onPress={generateFromScript}>
          <Text style={styles.trimDoneText}>Generate editable captions</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={preciseTrimOpen} animationType="slide" transparent
      onRequestClose={() => setPreciseTrimOpen(false)}>
      <View style={styles.captionBackdrop}>
        <View style={styles.captionSheet}>
          <View style={styles.row}>
            <Text style={styles.captionSheetTitle}>Precision trim</Text>
            <Pressable accessibilityLabel="Close precision editor" onPress={() => setPreciseTrimOpen(false)}>
              <Ionicons name="close" color="#F3F4F6" size={25} />
            </Pressable>
          </View>
          {selected ? <>
            <Text style={styles.trimHint}>Drag source points or adjust in 0.1-second steps. Video tracks move together to preserve sync.</Text>
            <View style={styles.trimHeader}>
              <Text style={styles.trimTitle}>Start · {(selected.inMs / 1000).toFixed(2)}s</Text>
              <Text style={styles.trimTitle}>End · {(selected.outMs / 1000).toFixed(2)}s</Text>
            </View>
            <Slider style={{ height: 42 }} minimumValue={0}
              maximumValue={Math.max(250, selected.outMs - 250 * selected.speed)}
              step={50} value={selected.inMs} minimumTrackTintColor="#23D4E9"
              maximumTrackTintColor="#757980" thumbTintColor="#23D4E9"
              onSlidingComplete={value => apply(p => setClipSourceEdge(p, selected.id, 'left', value))} />
            <View style={styles.trimRow}>
              <Tool label="Start −0.1s" onPress={() => apply(p => setClipSourceEdge(p, selected.id, 'left', selected.inMs - 100))} />
              <Tool label="Start +0.1s" onPress={() => apply(p => setClipSourceEdge(p, selected.id, 'left', selected.inMs + 100))} />
            </View>
            <Slider style={{ height: 42 }} minimumValue={Math.min(selected.outMs,selected.inMs + 250 * selected.speed)}
              maximumValue={Math.max(selected.outMs,project.assets.find(a=>a.id===selected.assetId)?.durationMs || selected.outMs)}
              step={50} value={selected.outMs} minimumTrackTintColor="#23D4E9"
              maximumTrackTintColor="#757980" thumbTintColor="#23D4E9"
              onSlidingComplete={value => apply(p => setClipSourceEdge(p, selected.id, 'right', value))} />
            <View style={styles.trimRow}>
              <Tool label="End −0.1s" onPress={() => apply(p => setClipSourceEdge(p, selected.id, 'right', selected.outMs - 100))} />
              <Tool label="End +0.1s" onPress={() => apply(p => setClipSourceEdge(p, selected.id, 'right', selected.outMs + 100))} />
            </View>
            <Text style={styles.trimHint}>Selected clip: {(clipDurationSafe(selected)/1000).toFixed(2)}s at {selected.speed.toFixed(2)}×</Text>
          </> : <Text style={styles.trimHint}>Select a clip to trim.</Text>}
          <Pressable style={styles.trimDone} onPress={() => setPreciseTrimOpen(false)}>
            <Text style={styles.trimDoneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={captionFindOpen} animationType="slide" transparent
      onRequestClose={()=>setCaptionFindOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
        style={styles.captionBackdrop}>
        <View style={styles.captionSheet}>
          <View style={styles.row}>
            <Text style={styles.captionSheetTitle}>Find & replace captions</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close caption correction"
              onPress={()=>setCaptionFindOpen(false)}>
              <Ionicons name="close" color="#F3F4F6" size={25}/>
            </Pressable>
          </View>
          <Text style={styles.trimHint}>
            Correct repeated names and phrases. Subtitle timing, formatting and title text are preserved.
          </Text>
          <TextInput style={styles.field} placeholder="Search subtitles" maxLength={100}
            placeholderTextColor="#8B96A1" value={captionFind} onChangeText={setCaptionFind}/>
          <TextInput style={styles.field} placeholder="Replace with..." maxLength={200}
            placeholderTextColor="#8B96A1" value={captionReplace} onChangeText={setCaptionReplace}/>
          <Pressable style={styles.trimDone} accessibilityRole="button" onPress={replaceCaptionWords}>
            <Text style={styles.trimDoneText}>Replace in all subtitles</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={captionPanelOpen} animationType="slide" transparent
      onRequestClose={() => { setCaptionPanelOpen(false); setCaptionStylesOpen(false); }}>
      <View style={styles.captionBackdrop}>
        <View style={styles.captionSheet}>
          <View style={styles.row}>
            <Text style={styles.captionSheetTitle}>{captionStylesOpen ? 'Caption appearance' : 'Captions & subtitles'}</Text>
            <Pressable accessibilityLabel="Close caption tools" onPress={() => {
              if (captionStylesOpen) setCaptionStylesOpen(false);
              else setCaptionPanelOpen(false);
            }}><Ionicons name="close" color="#F3F4F6" size={25}/></Pressable>
          </View>
          <ScrollView style={{maxHeight:500}} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}>
          {captionStylesOpen ?
            (['classic','punch','minimal','neon','documentary'] as CaptionPreset[]).map(preset =>
              <Pressable key={preset} style={styles.captionChoice} onPress={() => applyCaptionStyle(preset)}>
                <Ionicons name="color-palette-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>{preset[0].toUpperCase()+preset.slice(1)}</Text>
                <Ionicons name="chevron-forward" color="#7E858E" size={16}/>
              </Pressable>) :
            <>
              <Text style={styles.trimHint}>Recognition language · {SPEECH_LANGUAGES.find(x=>x.code===speechLanguage)?.label}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{gap:6,paddingBottom:10}}>
                {SPEECH_LANGUAGES.map(lang=><Tool key={lang.code} label={lang.short}
                  primary={lang.code===speechLanguage}
                  onPress={()=>setSpeechLanguage(lang.code)}/>)}
              </ScrollView>
              <Text style={styles.trimHint}>Captions · {scriptWords===1?'One word at a time':scriptWords+' words per phrase'}</Text>
              <View style={styles.trimRow}>
                {[1,3,5,7].map(n=><Tool key={n} label={n===1?'1 word':n+' words'} primary={scriptWords===n}
                  onPress={()=>setScriptWords(n)}/>)}
              </View>
              <Pressable style={styles.captionChoice} onPress={() => { void generateAutoCaptions(false); }} disabled={busy}>
                <Ionicons name="sparkles-outline" size={24} color="#23D4E9" />
                <View style={{flex:1}}>
                  <Text style={styles.captionChoiceLabel}>Transcribe selected clip</Text>
                  <Text style={styles.captionChoiceSub}>Offline speech recognition · iPhone native build</Text>
                </View>
              </Pressable>
              <Pressable style={styles.captionChoice} disabled={busy} onPress={() => { void generateAutoCaptions(true); }}>
                <Ionicons name="mic-outline" size={24} color="#23D4E9" />
                <View style={{flex:1}}>
                  <Text style={styles.captionChoiceLabel}>Transcribe entire video</Text>
                  <Text style={styles.captionChoiceSub}>Offline on iPhone · works across multiple clips</Text>
                </View>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={() => {
                setCaptionPanelOpen(false);setCaptionScript('');setScriptPanelOpen(true);
              }}>
                <Ionicons name="create-outline" size={24} color="#23D4E9" />
                <View style={{flex:1}}>
                  <Text style={styles.captionChoiceLabel}>Generate from script</Text>
                  <Text style={styles.captionChoiceSub}>Android and iPhone · editable estimated timing</Text>
                </View>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={removeLongPauses}>
                <Ionicons name="cut-outline" size={24} color="#23D4E9" />
                <View style={{flex:1}}>
                  <Text style={styles.captionChoiceLabel}>Remove long pauses</Text>
                  <Text style={styles.captionChoiceSub}>Speech-aware edits · iPhone build · undoable</Text>
                </View>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={importSubtitles}>
                <Ionicons name="document-text-outline" size={24} color="#23D4E9" />
                <View style={{flex:1}}>
                  <Text style={styles.captionChoiceLabel}>Import subtitle file</Text>
                  <Text style={styles.captionChoiceSub}>SRT and WebVTT · iOS and Android</Text>
                </View>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={() => setCaptionStylesOpen(true)}>
                <Ionicons name="color-palette-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>Caption appearance</Text>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={()=>{
                setCaptionPanelOpen(false);setCaptionFind('');setCaptionReplace('');setCaptionFindOpen(true);
              }}>
                <Ionicons name="search-outline" size={24} color="#23D4E9"/>
                <Text style={styles.captionChoiceLabel}>Find & replace subtitles</Text>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={() => {
                apply(p => fixSentenceCase(p)); setCaptionPanelOpen(false);
              }}>
                <Ionicons name="text-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>Fix sentence capitalization</Text>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={() => {
                apply(p => shiftAllCaptions(p,-100)); setCaptionPanelOpen(false);
              }}>
                <Ionicons name="play-back-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>Move all captions 0.1s earlier</Text>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={() => {
                apply(p => shiftAllCaptions(p,100)); setCaptionPanelOpen(false);
              }}>
                <Ionicons name="play-forward-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>Move all captions 0.1s later</Text>
              </Pressable>
              <Pressable style={styles.captionChoice} onPress={exportSubtitleFile}>
                <Ionicons name="share-outline" size={24} color="#23D4E9" />
                <Text style={styles.captionChoiceLabel}>Share subtitle file (.srt)</Text>
              </Pressable>
            </>}
          </ScrollView>
        </View>
      </View>
    </Modal>

    <Modal visible={fullPreview} animationType="fade" onRequestClose={() => setFullPreview(false)}>
      <View style={[styles.fullPreview, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <Pressable accessibilityLabel="Close fullscreen preview" onPress={() => setFullPreview(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
          <Ionicons name="close" color="white" size={30} /></Pressable>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <VideoStage project={project} playheadMs={positionMs} playing={false} seekVersion={seekVersion} maxHeight={620} />
        </View>
      </View>
    </Modal>
    <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
      <View style={[styles.searchPage, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
        <View style={styles.searchHeader}>
          <Pressable onPress={() => setSearchOpen(false)} accessibilityLabel="Close search">
            <Ionicons name="arrow-back" size={26} color="white" /></Pressable>
          <TextInput autoFocus placeholder="Search your clips and captions" placeholderTextColor="#83878D"
            style={styles.searchInput} value={searchTerm} onChangeText={setSearchTerm} />
        </View>
        <ScrollView keyboardShouldPersistTaps="always">
          {findInProject(searchTerm).map(item => <Pressable key={item.type + item.id}
            style={styles.searchResult} onPress={() => {
              if (item.type === 'clip') { setSelectedId(item.id); setSelectedTextId(null); }
              else { setSelectedTextId(item.id); setSelectedId(null); }
              setSearchOpen(false); seek(item.at);
            }}>
            <Ionicons name={item.type === 'clip' ? 'film-outline' : 'text-outline'} size={20} color="#23D4E9" />
            <Text numberOfLines={1} style={styles.searchResultLabel}>{item.title}</Text>
            <Text style={styles.searchResultTime}>{fmt(item.at)}</Text>
          </Pressable>)}
          {searchTerm.trim() && findInProject(searchTerm).length === 0 ?
            <Text style={{ color: '#90969F', textAlign: 'center', marginTop: 25 }}>No matching clips or captions</Text> : null}
        </ScrollView>
      </View>
    </Modal>

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
    <Modal visible={editTextPrompt} transparent animationType="fade" onRequestClose={() => setEditTextPrompt(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <Text style={styles.section}>EDIT TEXT</Text>
          <TextInput placeholder="Caption text" placeholderTextColor={theme.muted} value={titleText}
            onChangeText={setTitleText} multiline style={styles.field} />
          <View style={styles.controls}>
            <Tool label="Cancel" onPress={() => setEditTextPrompt(false)} />
            <Tool label="Save changes" primary onPress={() => {
              if (selectedText) apply(p => editTextLayer(p, selectedText.id, { text: titleText }));
              setEditTextPrompt(false);
            }} />
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

  lookCard: {backgroundColor:'#2A3036',width:92,padding:6,borderRadius:11,
    borderColor:'#3D4248',borderWidth:1,alignItems:'center',gap:6},
  lookSwatch: {height:52,width:74,borderRadius:8},
  lookName: {color:'#F5F7F8',fontSize:11,fontWeight:'600'},
  scriptInput: {color:'#F6F8FA',backgroundColor:'#25282C',borderRadius:12,
    padding:14,fontSize:15,minHeight:200,maxHeight:350,marginVertical:12},
  trimHint: { color:'#A5ABB0',fontSize:12,marginTop:14,marginBottom:10,lineHeight:18 },
  trimHeader: { flexDirection:'row',justifyContent:'space-between',marginTop:8 },
  trimTitle: { color:'#F4F6F7',fontSize:13,fontWeight:'600' },
  trimRow: { flexDirection:'row',gap:8,justifyContent:'space-between',marginBottom:10 },
  trimDone: { backgroundColor:'#23D4E9',borderRadius:10,alignItems:'center',paddingVertical:13,marginTop:16 },
  trimDoneText: { color:'#102125',fontWeight:'800',fontSize:15 },
  captionBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000AA' },
  captionSheet: { backgroundColor: '#222528', borderTopLeftRadius: 22,
    borderTopRightRadius: 22, paddingTop: 16, paddingBottom: 36, paddingHorizontal: 20 },
  captionSheetTitle: { fontSize: 18, fontWeight: '800', color: '#F9FBFD' },
  captionChoice: { flexDirection: 'row', gap: 16, alignItems: 'center',
    minHeight: 60, borderBottomWidth: 1, borderBottomColor: '#34373B' },
  captionChoiceLabel: { color: '#F4F6F8', fontSize: 15, fontWeight: '600' },
  captionChoiceSub: { color: '#8B939C', fontSize: 11, marginTop: 3 },
  editorScreen: { flex: 1, backgroundColor: '#111214' },
  mobileHeader: { height: 57, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center',
    gap: 7, backgroundColor: '#111214' },
  headerIcon: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerProject: { flex: 1, justifyContent: 'center', minWidth: 30 },
  headerProjectText: { color: '#777C84', fontSize: 11 },
  qualityButton: { height: 39, minWidth: 81, paddingHorizontal: 9, borderRadius: 10,
    backgroundColor: '#292B2F', flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 5 },
  qualityLabel: { color: '#F8F9FA', fontSize: 15, fontWeight: '600' },
  exportButton: { height: 39, minWidth: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#22D1E7', borderRadius: 9, paddingHorizontal: 13 },
  exportText: { color: '#0A1A22', fontSize: 16, fontWeight: '700' },
  mobileCanvas: { flex: 1, minHeight: 105, backgroundColor: '#111214', justifyContent: 'center', alignItems: 'center' },
  canvasCenter: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mobileTransport: { height: 49, paddingHorizontal: 14, backgroundColor: '#111214',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transportSide: { width: 65, alignItems: 'flex-start', justifyContent: 'center' },
  playControl: { height: 46, width: 76, alignItems: 'center', justifyContent: 'center' },
  transportRight: { width: 100, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  contextBar: { backgroundColor: '#1D1F22', paddingHorizontal: 14, paddingTop: 5, paddingBottom: 2,
    height: 102, justifyContent: 'center' },
  contextTitle: { color: '#F1F3F4', fontSize: 12, fontWeight: '700' },
  contextVolume: { color: '#92999E', fontSize: 11, marginTop: 2 },
  recordingBanner: { height: 28, alignItems: 'center', justifyContent: 'center', gap: 8,
    flexDirection: 'row', backgroundColor: '#322127' },
  recordingBannerText: { color: '#F5A3AF', fontSize: 12 },
  shareResult: { height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#203B3D' },
  shareResultText: { fontSize: 12, fontWeight: '700', color: '#57DEE8' },
  fullPreview: { flex: 1, backgroundColor: '#050505', paddingHorizontal: 16 },
  searchPage: { flex: 1, backgroundColor: '#111214', paddingHorizontal: 16 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  searchInput: { flex: 1, backgroundColor: '#26292D', borderRadius: 12, padding: 12,
    color: 'white', fontSize: 15 },
  searchResult: { minHeight: 57, paddingHorizontal: 10, flexDirection: 'row',
    alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: '#25282C' },
  searchResultLabel: { color: '#F3F5F6', fontSize: 14, flex: 1 },
  searchResultTime: { color: '#8E9398', fontSize: 12 },

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
