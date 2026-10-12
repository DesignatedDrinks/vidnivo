import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,
  Share,StyleSheet,Text,TextInput,View,Linking} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type {Project} from '../domain/timeline';
import {generateSocialPostDraft} from '../social/openai';
import {loadOpenAIKey,saveOpenAIKey,removeOpenAIKey} from '../social/secrets';
import {loadSocialDraft,saveSocialDraft} from '../social/drafts';
import {SOCIAL_PLATFORMS,SOCIAL_LABELS,EMPTY_SOCIAL_DRAFT,
  type SocialPlatform,type SocialPostDraft} from '../social/copy';
import {uploadVideoToYouTube} from '../social/youtube';
import {shareExport} from '../export/native';
import type {YouTubePrivacy} from '../social/youtubeCore';

interface Props {
 visible:boolean;
 project:Project;
 onClose:()=>void;
 exportUri:string|null;
 exportVideo:()=>void;
 youtubeToken:string|null;
 canConnectYouTube:boolean;
 connectYouTube:()=>void;
}

export function SocialStudio({visible,project,onClose,exportUri,exportVideo,
  youtubeToken,canConnectYouTube,connectYouTube}:Props){
 const insets=useSafeAreaInsets();
 const [apiKeyInput,setApiKeyInput]=useState('');
 const [hasKey,setHasKey]=useState(false);
 const [directions,setDirections]=useState('');
 const [draft,setDraft]=useState<SocialPostDraft|null>(null);
 const [draftRevision,setDraftRevision]=useState<number|null>(null);
 const [selected,setSelected]=useState<SocialPlatform>('instagram');
 const [privacy,setPrivacy]=useState<YouTubePrivacy>('private');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!visible)return;
  let active=true;
  setApiKeyInput('');
  Promise.all([loadOpenAIKey(),loadSocialDraft(project.id)])
   .then(([key,saved])=>{
    if(!active)return;
    setHasKey(Boolean(key));
    setDraft(saved?.draft??null);
    setDraftRevision(saved?.revision??null);
   }).catch(e=>{
    if(active)Alert.alert('Social Studio', 'Could not load secure settings or saved posts: '+String(e));
   });
  return ()=>{active=false;};
 },[visible,project.id]);

 const saveKey=async()=>{
  try{
   setBusy(true);
   await saveOpenAIKey(apiKeyInput);
   setHasKey(true);
   setApiKeyInput('');
   Alert.alert('API key saved','Your OpenAI key is stored in this device\'s secure storage, not Google Sheets.');
  }catch(e){Alert.alert('Could not save key',e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const deleteKey=()=>{
  Alert.alert('Remove API key?','This deletes your saved OpenAI key from this phone.',[
   {text:'Cancel',style:'cancel'},
   {text:'Remove',style:'destructive',onPress:()=>{void removeOpenAIKey().then(()=>{
    setHasKey(false);setApiKeyInput('');
   }).catch(e=>Alert.alert('Could not remove key',String(e)));}}
  ]);
 };
 const generate=async()=>{
  if(!hasKey){Alert.alert('Add an OpenAI key','Save your API key before generating posts.');return;}
  Alert.alert('Generate five post captions?',
   'VIDNIVO will send the spoken subtitle text and your instructions to your OpenAI API account. API charges may apply.',[
    {text:'Cancel',style:'cancel'},
    {text:'Generate',onPress:()=>{
     void (async()=>{
      try{
       setBusy(true);
       const key=await loadOpenAIKey();
       if(!key)throw Error('Your saved API key was not found.');
       const generated=await generateSocialPostDraft(project,key,directions);
       await saveSocialDraft(project.id,project.revision,generated);
       setDraft(generated);
       setDraftRevision(project.revision);
      }catch(e){Alert.alert('Generation failed',e instanceof Error?e.message:String(e));}
      finally{setBusy(false);}
     })();
    }}
   ]);
 };
 const saveEdits=async()=>{
  if(!draft)return;
  try{
   setBusy(true);
   await saveSocialDraft(project.id,project.revision,draft);
   setDraftRevision(project.revision);
   Alert.alert('Drafts saved','Your platform captions are saved locally to this project.');
  }catch(e){Alert.alert('Save failed',String(e));}
  finally{setBusy(false);}
 };
 const edited=(key:keyof SocialPostDraft,value:string)=>{
  setDraft(current=>current?{...current,[key]:value}:current);
 };
 const copyCaption=async()=>{
  if(!draft)return;
  try{
   const copy=selected==='youtube'?draft.youtube: draft[selected];
   await Clipboard.setStringAsync(copy);
   Alert.alert('Caption copied','Paste it into the social app of your choice.');
  }catch(e){Alert.alert('Copy failed',String(e));}
 };
 const shareCaption=async()=>{
  if(!draft)return;
  try{await Share.share({message:draft[selected]});}
  catch(e){Alert.alert('Sharing failed',String(e));}
 };
 const shareWithVideo=async()=>{
  if(!draft)return;
  if(!exportUri){
   Alert.alert('Export video first','Finish exporting an MP4 before sharing it with a social app.');
   return;
  }
  try{
   await Clipboard.setStringAsync(draft[selected]);
   await shareExport(exportUri);
  }catch(e){Alert.alert('Sharing failed',String(e));}
 };
 const uploadYouTube=()=>{
  if(!draft)return;
  if(!exportUri){Alert.alert('Export video first','The exported MP4 is needed for YouTube.');return;}
  if(!youtubeToken){Alert.alert('Connect YouTube','Authorize your YouTube channel first.');return;}
  const headline=privacy==='public'?'PUBLIC':privacy==='unlisted'?'UNLISTED':'PRIVATE';
  Alert.alert('Publish to YouTube?', 'Upload this MP4 to your authorized YouTube channel as '+headline+'? This sends the video to Google.',[
   {text:'Cancel',style:'cancel'},
   {text:'Upload',onPress:()=>{void (async()=>{
    try{
     setBusy(true);
     await saveSocialDraft(project.id,project.revision,draft);
     const url=await uploadVideoToYouTube(exportUri,youtubeToken,draft.youtubeTitle,draft.youtube,privacy);
     Alert.alert('YouTube upload accepted','Your video was created on YouTube. Processing may take time.',[
      {text:'Done'},{text:'Open video',onPress:()=>{void Linking.openURL(url);}}
     ]);
    }catch(e){Alert.alert('Upload failed',e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
   })();}}
  ]);
 };
 const pill=(text:string,active:boolean,onPress:()=>void)=>(
  <Pressable onPress={onPress} style={[styles.pill,active&&styles.pillOn]}>
   <Text style={[styles.pillText,active&&styles.pillTextOn]}>{text}</Text>
  </Pressable>);
 return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
    style={[styles.screen,{paddingTop:insets.top+12,paddingBottom:insets.bottom+10}]}>
   <View style={styles.header}>
    <View><Text style={styles.title}>Social Studio</Text>
     <Text style={styles.subtitle}>Turn your video into ready-to-post content</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close Social Studio"
      onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
   </View>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.card}>
     <Text style={styles.heading}>1 · Connect your OpenAI key</Text>
     <Text style={styles.muted}>{hasKey?'✓ Key saved securely on this device.':'Your key stays on this phone and is sent only to the official OpenAI API.'}</Text>
     <TextInput value={apiKeyInput} onChangeText={setApiKeyInput} secureTextEntry
       autoCapitalize="none" autoCorrect={false} placeholder="sk-…"
       placeholderTextColor="#7B8793" style={styles.input}/>
     <View style={styles.actions}>
      <Pressable disabled={busy||!apiKeyInput.trim()} onPress={()=>{void saveKey();}}
        style={[styles.btn,!apiKeyInput.trim()&&styles.dim]}><Text style={styles.buttonText}>Save key</Text></Pressable>
      {hasKey?<Pressable disabled={busy} onPress={deleteKey} style={styles.outline}>
       <Text style={styles.outlineText}>Remove key</Text></Pressable>:null}
     </View>
    </View>
    <View style={styles.card}>
     <Text style={styles.heading}>2 · Generate platform-specific posts</Text>
     <Text style={styles.muted}>Uses spoken captions, not visual analysis. Add or import subtitles before generating. No invented claims or links.</Text>
     <TextInput multiline value={directions} onChangeText={setDirections} maxLength={1200}
       placeholder="Your tone, call to action, website, audience, or campaign notes…"
       placeholderTextColor="#7B8793" textAlignVertical="top" style={[styles.input,{minHeight:70}]}/>
     <Pressable disabled={busy||!hasKey} style={[styles.btn,busy&&styles.dim]} onPress={()=>{void generate();}}>
      <Text style={styles.buttonText}>{busy?'Working…':'✦ Generate five post captions'}</Text>
     </Pressable>
     <Text style={styles.fine}>Requires an OpenAI API account with available credits; transcription text and instructions are sent to OpenAI when you tap Generate.</Text>
    </View>
    {draft?<View style={styles.card}>
     <Text style={styles.heading}>3 · Review and edit</Text>
     {draftRevision!==null&&draftRevision!==project.revision?<Text style={styles.warning}>Your video has changed since these posts were saved. Regenerate before publishing.</Text>:null}
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,marginVertical:12}}>
      {SOCIAL_PLATFORMS.map(p=><View key={p}>{pill(SOCIAL_LABELS[p],p===selected,()=>setSelected(p))}</View>)}
     </ScrollView>
     {selected==='youtube'?<>
      <Text style={styles.fieldLabel}>YouTube title</Text>
      <TextInput value={draft.youtubeTitle} maxLength={100} onChangeText={v=>edited('youtubeTitle',v)}
        style={styles.input} placeholderTextColor="#7B8793"/>
     </>:null}
     <Text style={styles.fieldLabel}>{SOCIAL_LABELS[selected]} post caption</Text>
     <TextInput multiline value={draft[selected]} onChangeText={v=>edited(selected,v)}
       textAlignVertical="top" style={[styles.input,{minHeight:190}]}/>
     <View style={styles.actions}>
      <Pressable style={styles.outline} onPress={()=>{void copyCaption();}}><Text style={styles.outlineText}>Copy</Text></Pressable>
      <Pressable style={styles.outline} onPress={()=>{void shareCaption();}}><Text style={styles.outlineText}>Share text</Text></Pressable>
      <Pressable style={styles.btn} disabled={busy} onPress={()=>{void saveEdits();}}><Text style={styles.buttonText}>Save</Text></Pressable>
     </View>
     {exportUri?<Pressable onPress={()=>{void shareWithVideo();}} style={[styles.btn,{marginTop:12}]}>
       <Text style={styles.buttonText}>Copy caption + share MP4</Text>
      </Pressable>:
      <Pressable onPress={exportVideo} style={[styles.outline,{marginTop:12}]}>
       <Text style={styles.outlineText}>Export MP4 to share with social apps</Text>
      </Pressable>}
     <Text style={styles.fine}>Instagram, TikTok, Facebook and LinkedIn sharing opens the native share chooser. Posting is completed in that app; no automatic publishing is claimed.</Text>
    </View>:null}
    <View style={styles.card}>
     <Text style={styles.heading}>4 · Connected publishing</Text>
     <Text style={styles.muted}>YouTube: direct authorized upload is available when Google OAuth and YouTube API are configured. Other platforms require separate official app approvals and OAuth integration.</Text>
     <View style={styles.actions}>
      <Pressable style={styles.outline} disabled={busy||!canConnectYouTube} onPress={connectYouTube}>
       <Text style={styles.outlineText}>{youtubeToken?'✓ YouTube authorized':'Connect YouTube'}</Text>
      </Pressable>
     </View>
     {!canConnectYouTube?<Text style={styles.warning}>Google OAuth client IDs are not configured. Connect YouTube after developer credentials are installed.</Text>:null}
     {draft&&selected==='youtube'?<>
      <Text style={styles.fieldLabel}>YouTube visibility</Text>
      <View style={styles.actions}>
       {(['private','unlisted','public'] as YouTubePrivacy[]).map(p=><View key={p}>{pill(p.toUpperCase(),privacy===p,()=>setPrivacy(p))}</View>)}
      </View>
      <Pressable style={[styles.btn,{marginTop:12},(!youtubeToken||!exportUri)&&styles.dim]}
       disabled={busy||!youtubeToken||!exportUri} onPress={uploadYouTube}>
       <Text style={styles.buttonText}>Upload to YouTube ({privacy})</Text></Pressable>
     </>:null}
     <Text style={styles.fine}>Uploads require explicit confirmation. YouTube access is session-based; reconnect after token expiry. No automatic cross-platform posting occurs without authorization.</Text>
    </View>
   </ScrollView>
   {busy?<View style={styles.loading}><ActivityIndicator color="#27D4E7"/><Text style={styles.muted}>Processing request…</Text></View>:null}
  </KeyboardAvoidingView>
 </Modal>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#111316'},
 header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:17,paddingBottom:10},
 title:{color:'#FFFFFF',fontSize:23,fontWeight:'800'},
 subtitle:{color:'#A5B0B9',fontSize:12,marginTop:2},
 close:{padding:10},closeText:{color:'#EEEEEE',fontSize:24},
 content:{padding:14,gap:12,paddingBottom:50},
 card:{backgroundColor:'#20242B',borderRadius:16,padding:16,gap:10},
 heading:{color:'#FFFFFF',fontSize:17,fontWeight:'750'},
 muted:{color:'#B9C2CD',fontSize:12,lineHeight:18},
 fine:{color:'#8C98A5',fontSize:11,lineHeight:16},
 warning:{color:'#FFD39D',fontSize:12,marginTop:8},
 input:{borderRadius:9,borderWidth:1,borderColor:'#46505A',backgroundColor:'#15191D',
  padding:11,color:'#FFFFFF',fontSize:14},
 fieldLabel:{color:'#D6DFE7',fontWeight:'600',fontSize:12,marginTop:4},
 actions:{flexDirection:'row',gap:7,alignItems:'center',flexWrap:'wrap'},
 btn:{backgroundColor:'#26D3E4',paddingHorizontal:14,paddingVertical:11,borderRadius:10,alignItems:'center'},
 dim:{opacity:.45},
 buttonText:{color:'#09242B',fontWeight:'800',fontSize:13},
 outline:{paddingHorizontal:13,paddingVertical:10,borderRadius:9,borderWidth:1,borderColor:'#5B6570'},
 outlineText:{color:'#F0F6F9',fontWeight:'700',fontSize:12},
 pill:{backgroundColor:'#313943',borderRadius:20,paddingVertical:8,paddingHorizontal:11},
 pillOn:{backgroundColor:'#24C9DC'},
 pillText:{color:'#D4DDE6',fontSize:11,fontWeight:'600'},
 pillTextOn:{color:'#07272B'},
 loading:{alignItems:'center',paddingVertical:8,flexDirection:'row',justifyContent:'center',gap:12}
});
