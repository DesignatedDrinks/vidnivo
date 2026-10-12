import React,{useState} from 'react';
import {Alert,ActivityIndicator,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import type {Project} from '../domain/timeline';
import {duplicateProject} from '../domain/timeline';
import {signInCloud,signOutCloud,type CloudSession} from '../cloud/account';
import {listCloudProjects,restoreProjectFromCloud} from '../cloud/transfer';
import {restoredName} from '../cloud/portable';
import {theme} from './theme';

interface Props{
 session:CloudSession|null;
 setSession:(account:CloudSession|null)=>void;
 setProjects:React.Dispatch<React.SetStateAction<Project[]>>;
}
const action=(label:string,handler:()=>void,disabled=false)=>
 <Pressable onPress={handler} disabled={disabled} accessibilityRole="button"
 style={{backgroundColor:theme.raised,padding:12,borderRadius:9,opacity:disabled?.5:1}}>
 <Text style={{color:theme.text,fontSize:12,fontWeight:'700'}}>{label}</Text>
 </Pressable>;
export function CloudWorkspace({session,setSession,setProjects}:Props){
 const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [remote,setRemote]=useState<{id:string;name:string;version:number}[]>([]);
 const refresh=async()=>{
  if(!session)return;
  try{setBusy(true);setRemote(await listCloudProjects());}
  catch(e){Alert.alert('Cloud library unavailable',e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const authenticate=async(createAccount:boolean)=>{
  if(!email.trim()||!password)return Alert.alert('VIDNIVO Cloud','Enter an email address and password.');
  try{
   setBusy(true);
   const user=await signInCloud(email,password,createAccount);
   setSession(user);setOpen(false);setPassword('');
   setRemote(await listCloudProjects());
  }catch(e){Alert.alert('Sign-in unsuccessful',e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const restore=async(id:string)=>{
  try{
   setBusy(true);
   const original=await restoreProjectFromCloud(id);
   setProjects(items=>{
    const local=items.find(p=>p.id===original.id);
    if(!local)return [original,...items];
    if(local.cloudVersion===original.cloudVersion)return items;
    const fork=duplicateProject(original);
    return [{...fork,name:restoredName(original.name)},...items];
   });
   Alert.alert('Cloud restore complete','The video, audio, photos and edits have been downloaded. Existing drafts were preserved.');
  }catch(e){Alert.alert('Cloud restore incomplete',
   (e instanceof Error?e.message:String(e))+
   '\nNo existing project was replaced.');}
  finally{setBusy(false);}
 };
 return <View style={{backgroundColor:theme.surface,borderRadius:14,padding:14,marginBottom:12,gap:10}}>
  <Text style={{color:theme.text,fontWeight:'800',fontSize:12,letterSpacing:1}}>VIDNIVO CLOUD BACKUP</Text>
  <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>
   {session?'Signed in: '+session.email:'Back up your full project and its original media. Sign in with the same account on another phone to restore.'}
  </Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   {!session?action('Sign in / Create account',()=>setOpen(true),busy):<>
    {action('Find my cloud projects',()=>{void refresh();},busy)}
    {action('Sign out',()=>{void signOutCloud().then(()=>{
     setRemote([]);setSession(null);
    }).catch(e=>Alert.alert('Sign out failed',String(e)));},busy)}
   </>}
  </View>
  {busy?<ActivityIndicator color={theme.accent}/>:null}
  {session?<ScrollView nestedScrollEnabled style={{maxHeight:220}}>
   {remote.map(p=><View key={p.id} style={{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'center',paddingVertical:10,borderTopWidth:1,borderColor:theme.border}}>
    <View style={{flex:1}}><Text style={{color:theme.text,fontWeight:'700'}}>{p.name}</Text>
     <Text style={{color:theme.muted,fontSize:11}}>Cloud version {p.version}</Text></View>
    {action('Restore',()=>{void restore(p.id);},busy)}
   </View>)}
  </ScrollView>:null}
  <Text style={{color:theme.muted,fontSize:11}}>
   Restore never overwrites a different local edit. Back up from the editor's More menu.
  </Text>
  <Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}>
   <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
    style={{flex:1,justifyContent:'center',backgroundColor:'#000000BC',padding:24}}>
    <View style={{padding:20,borderRadius:16,backgroundColor:theme.surface,gap:12}}>
     <Text style={{color:theme.text,fontSize:20,fontWeight:'800'}}>VIDNIVO Cloud</Text>
     <TextInput accessibilityLabel="Email address" autoCapitalize="none" keyboardType="email-address"
      autoComplete="email" value={email} onChangeText={setEmail}
      placeholder="Email" placeholderTextColor={theme.muted}
      style={{backgroundColor:theme.raised,color:theme.text,padding:12,borderRadius:8}}/>
     <TextInput accessibilityLabel="Password" autoCapitalize="none" secureTextEntry
      value={password} onChangeText={setPassword}
      placeholder="Password" placeholderTextColor={theme.muted}
      style={{backgroundColor:theme.raised,color:theme.text,padding:12,borderRadius:8}}/>
     {action('Sign in',()=>{void authenticate(false);},busy)}
     {action('Create account',()=>{void authenticate(true);},busy)}
     {action('Cancel',()=>setOpen(false),busy)}
    </View>
   </KeyboardAvoidingView>
  </Modal>
 </View>;
}
