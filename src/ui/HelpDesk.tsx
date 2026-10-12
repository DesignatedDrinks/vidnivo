import React,{useState} from 'react';
import {ActivityIndicator,Alert,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {File} from 'expo-file-system';
import type {Project} from '../domain/timeline';
import {cloudRequest} from '../cloud/account';
import {collectSupportDiagnostics,localSupportDiagnosis,safeSupportDiagnosis,
 type SupportDiagnosis,type SupportDiagnostics} from '../support/diagnostics';
import {theme} from './theme';

interface Props {
 visible:boolean;
 onClose:()=>void;
 project:Project|null;
 cloudConnected:boolean;
 saveFailed:boolean;
 exportSupported:boolean;
 quality:720|1080;
 onRetrySave:()=>Promise<void>;
 onRestartPreview:()=>void;
 onLowerExportQuality:()=>void;
}
const control=(title:string,onPress:()=>void,disabled=false,primary=false)=>
 <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
  style={{padding:13,borderRadius:10,backgroundColor:primary?theme.accent:theme.raised,
   opacity:disabled?0.45:1,alignItems:'center'}}>
  <Text style={{fontSize:14,fontWeight:'700',color:primary?theme.accentText:theme.text}}>{title}</Text>
 </Pressable>;
export function HelpDesk({visible,onClose,project,cloudConnected,saveFailed,
 exportSupported,quality,onRetrySave,onRestartPreview,onLowerExportQuality}:Props){
 const [issue,setIssue]=useState('');
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<SupportDiagnosis|null>(null);
 const [repair,setRepair]=useState('');
 const [source,setSource]=useState<'ai'|'local'|null>(null);
 const screen:SupportDiagnostics['screen']=project?'editor':'projects';
 const diagnostics=()=>collectSupportDiagnostics(project,{
  screen,platform:Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web',
  quality,saveFailed,exportSupported,cloudSignedIn:cloudConnected
 },uri=>{try{return new File(uri).exists;}catch{return false;}});
 const ask=async()=>{
  const query=issue.trim();
  if(query.length<5){Alert.alert('Describe the problem','Please enter at least five characters.');return;}
  setBusy(true);setResult(null);setRepair('');setSource(null);
  try{
   const d=diagnostics(),fallback=localSupportDiagnosis(query,d);
   let answer=fallback;
   if(cloudConnected){
    try{
     const server=await cloudRequest('/api/v1/support/diagnose',{
      method:'POST',body:JSON.stringify({issue:query,diagnostics:d})
     });
     answer=safeSupportDiagnosis(server,fallback);
    }catch{
     // Network outage, expired credentials or unavailable support API must
     // never block local diagnostics or destroy the editing session.
     answer=fallback;
    }
   }
   setResult(answer);setSource(answer.aiGenerated?'ai':'local');
   // Only reversible local settings are applied automatically. Cloud media,
   // timelines and application code cannot be mutated by a model response.
   if(answer.action==='retry-save'){
    await onRetrySave();
    setRepair('Local draft save retried. Check the save warning to confirm it completed.');
   }else if(answer.action==='restart-preview'){
    onRestartPreview();
    setRepair('Preview reset. The clips, captions and audio were not changed.');
   }else if(answer.action==='set-export-720'&&quality!==720&&exportSupported){
    onLowerExportQuality();
    setRepair('Next export set to 720p. Existing video clips were not changed.');
   }
  }catch(e){Alert.alert('Help temporarily unavailable',String(e));}
  finally{setBusy(false);}
 };
 return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
   style={{flex:1,backgroundColor:theme.bg,paddingTop:55,paddingHorizontal:19,paddingBottom:28}}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingBottom:15}}>
    <Text style={{fontWeight:'900',fontSize:24,color:theme.text}}>VIDNIVO Help</Text>
    {control('Close',onClose,busy)}
   </View>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:30}}>
    <Text style={{fontSize:14,color:theme.muted,lineHeight:22}}>
     Tell me what is broken. I will check safe app diagnostics and automatically
     retry reversible repairs when possible. Your video content, filenames and
     personal account details are not included in diagnostics.
    </Text>
    <TextInput value={issue} onChangeText={setIssue} multiline maxLength={1200}
     placeholder="Example: Export stops after I add a voiceover"
     placeholderTextColor={theme.muted} accessibilityLabel="Describe your problem"
     style={{minHeight:142,textAlignVertical:'top',backgroundColor:theme.surface,
      color:theme.text,borderRadius:12,padding:16,fontSize:15,lineHeight:22}}/>
    {control(busy?'Checking the problem…':'Diagnose and try a safe fix',()=>{void ask();},busy,true)}
    {busy?<ActivityIndicator color={theme.accent}/>:null}
    {result?<View style={{backgroundColor:theme.surface,borderRadius:12,padding:16,gap:12}}>
     <Text style={{color:theme.accent,fontWeight:'800',fontSize:13}}>
      {source==='ai'?'AI support response':'Local diagnostic response'}
     </Text>
     <Text style={{fontSize:15,lineHeight:23,color:theme.text}}>{result.answer}</Text>
     {repair?<Text style={{color:theme.accent,fontSize:13,fontWeight:'700'}}>{repair}</Text>:null}
     <Text style={{fontSize:12,color:theme.muted,lineHeight:18}}>
      If the problem persists, describe what happened after this attempt.
      Source-code defects cannot be changed on a customer's phone directly.
     </Text>
    </View>:null}
    <Text style={{color:theme.muted,fontSize:12,lineHeight:19}}>
     {cloudConnected?
      'When AI support is configured, your description and limited technical diagnostics are sent to VIDNIVO Cloud and its AI provider. Unresolved problem categories are logged without your written report or footage.':
      'You are not signed into VIDNIVO Cloud, so Help uses built-in offline diagnostics. Sign into Cloud for AI-assisted troubleshooting when the support service is enabled.'}
    </Text>
   </ScrollView>
  </KeyboardAvoidingView>
 </Modal>;
}
