import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,KeyboardAvoidingView,Modal,Platform,Pressable,
 ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {createUserWithEmailAndPassword,onAuthStateChanged,sendEmailVerification,
 signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import type {Asset,Project} from '../domain/timeline';
import {cloudAuth,firebaseReady,firebaseStorageReady} from '../cloud/firebaseClient';
import {cloudApiConfigured,fetchAccountProfile,updateAccountProfile} from '../cloud/apiClient';
import {uploadSmallMedia,CLOUD_UPLOAD_LIMIT} from '../cloud/mediaUpload';

interface Props {visible:boolean;project:Project|null;onClose:()=>void}
function readableError(error:unknown):string {
 const code=(error && typeof error==='object' && 'code' in error)?String(error.code):'';
 if(code==='auth/email-already-in-use')return 'This email already has an account. Sign in instead.';
 if(code==='auth/invalid-email')return 'Enter a valid email address.';
 if(code==='auth/weak-password')return 'Use a stronger password.';
 if(code==='auth/invalid-credential'||code==='auth/wrong-password')return 'Email or password incorrect.';
 if(code==='auth/network-request-failed')return 'Check your internet connection.';
 return 'The operation could not complete. Check your connection and Firebase setup.';
}
const Button=({label,onPress,disabled=false,secondary=false}:{
 label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean
})=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
 style={[styles.button,secondary&&styles.secondary,disabled&&{opacity:.4}]}>
 <Text style={[styles.buttonLabel,secondary&&styles.secondaryLabel]}>{label}</Text>
 </Pressable>;
export function CloudAccountSheet({visible,project,onClose}:Props){
 const insets=useSafeAreaInsets();
 const [user,setUser]=useState<User|null>(null);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [profileLoaded,setProfileLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState<string|null>(null);
 const [progress,setProgress]=useState(0);
 const [uploaded,setUploaded]=useState<string[]>([]);
 useEffect(()=>{
  if(!visible || !firebaseReady)return;
  let active=true;
  const unlisten=onAuthStateChanged(cloudAuth(),next=>{
    if(!active)return;
    setUser(next);
    setPassword('');
    setProfileLoaded(false);
    setUploaded([]);
  });
  return()=>{active=false;unlisten();};
 },[visible]);
 useEffect(()=>{
  if(!visible || !user || !cloudApiConfigured)return;
  let active=true;
  fetchAccountProfile(user).then(profile=>{
   if(active){setDisplayName(profile?.displayName??'');setProfileLoaded(true);}
  }).catch(()=>{
   if(active)setProfileLoaded(false);
  });
  return()=>{active=false;};
 },[visible,user?.uid]);

 const enter=async(mode:'login'|'create')=>{
  if(busy)return;
  if(!firebaseReady){Alert.alert('Cloud not configured','The project owner must configure Firebase Auth first.');return;}
  if(!email.trim() || !password){
   Alert.alert('Missing account details','Enter your email and password.');return;
  }
  setBusy(true);
  try{
   if(mode==='create'){
    const result=await createUserWithEmailAndPassword(cloudAuth(),email.trim(),password);
    await sendEmailVerification(result.user);
    Alert.alert('Check your email','Verify your email before uploading cloud media.');
   }else await signInWithEmailAndPassword(cloudAuth(),email.trim(),password);
   setPassword('');
  }catch(e){Alert.alert('Authentication failed',readableError(e));}
  finally{setBusy(false);}
 };
 const refreshEmail=async()=>{
  if(!user)return;
  try{setBusy(true);await user.reload();await user.getIdToken(true);setUser(cloudAuth().currentUser);}
  catch(e){Alert.alert('Cannot refresh email verification',readableError(e));}
  finally{setBusy(false);}
 };
 const saveProfile=async()=>{
  if(!user)return;
  try{
   setBusy(true);
   await updateAccountProfile(user,displayName);
   setProfileLoaded(true);
   Alert.alert('Saved','Your private cloud profile was updated.');
  }catch(e){Alert.alert('Profile not saved',e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const startUpload=(asset:Asset)=>{
  if(!user)return;
  if(!user.emailVerified){
   Alert.alert('Verify your email','Open your verification email and then tap Refresh verification.');return;
  }
  if(!firebaseStorageReady){
   Alert.alert('Storage not configured','Cloud Storage for Firebase requires a Blaze billing plan and an authorized private bucket.');return;
  }
  Alert.alert('Back up this media file?',asset.filename+
   '\nThis transfers the source file to your private Firebase Storage folder. Cloud Storage requires a Blaze plan and may incur fees.',[
    {text:'Cancel',style:'cancel'},
    {text:'Upload privately',onPress:()=>{void (async()=>{
     try{
      setUploading(asset.id);setProgress(0);
      const path=await uploadSmallMedia(user,asset,setProgress);
      setUploaded(old=>[...new Set([...old,path])]);
      Alert.alert('Private upload complete','Media stored in your Firebase account folder. Cross-device editing is not enabled yet.');
     }catch(e){Alert.alert('Upload failed',e instanceof Error?e.message:String(e));}
     finally{setUploading(null);}
    })();}}
   ]);
 };
 return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
   style={[styles.screen,{paddingTop:insets.top+12,paddingBottom:insets.bottom+15}]}>
   <View style={styles.header}>
    <View><Text style={styles.title}>VIDNIVO Cloud</Text>
      <Text style={styles.caption}>Private account and media backup beta</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close cloud accounts"
     onPress={onClose} disabled={busy||Boolean(uploading)}>
     <Ionicons name="close" color="#F2F7F9" size={26}/></Pressable>
   </View>
   <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {!firebaseReady?<View style={styles.panel}>
      <Text style={styles.heading}>Cloud account setup pending</Text>
      <Text style={styles.info}>The app owner must connect a Firebase project and configure its public client IDs. Local editing and the existing Google Sheets project database are unchanged.</Text>
     </View>:user?<>
      <View style={styles.panel}>
       <Text style={styles.heading}>Signed in</Text>
       <Text style={styles.info}>{user.email??'Firebase account'}</Text>
       <View style={styles.row}>
        <Ionicons name={user.emailVerified?'checkmark-circle':'alert-circle-outline'}
         size={18} color={user.emailVerified?'#70DCB8':'#F6C178'}/>
        <Text style={styles.info}>{user.emailVerified?'Email verified':'Email verification required before uploads'}</Text>
       </View>
       {!user.emailVerified?<Button label="Refresh verification" onPress={()=>{void refreshEmail();}} disabled={busy}/>:null}
       <Button secondary label="Sign out" disabled={busy||Boolean(uploading)}
        onPress={()=>{void signOut(cloudAuth());}} />
      </View>
      <View style={styles.panel}>
       <Text style={styles.heading}>Cloud profile</Text>
       <Text style={styles.info}>{cloudApiConfigured?'Firebase token verified by the Cloud Run API.':'Cloud Run is not connected yet; profile editing is unavailable.'}</Text>
       <TextInput placeholder="Your display name" placeholderTextColor="#788A96" value={displayName}
        onChangeText={setDisplayName} maxLength={80} style={styles.input}/>
       <Button label={profileLoaded?'Update profile':'Save profile'}
        disabled={!cloudApiConfigured||busy} onPress={()=>{void saveProfile();}}/>
      </View>
      <View style={styles.panel}>
       <Text style={styles.heading}>Private source-media backup</Text>
       <Text style={styles.info}>Beta limit: {Math.round(CLOUD_UPLOAD_LIMIT/(1024*1024))} MiB per file. Only the files you explicitly choose are uploaded. Large videos stay on this device.</Text>
       <Text style={styles.info}>{firebaseStorageReady?'Storage bucket configured. Uploads require verified email.':'Firebase Storage bucket is not configured. Blaze billing is required.'}</Text>
       {!project?.assets.length?<Text style={styles.info}>Open a project with imported media to back up a file.</Text>:
        project.assets.slice(0,20).map(asset=><View key={asset.id} style={styles.asset}>
         <Text style={styles.assetText} numberOfLines={2}>{asset.filename}</Text>
         <Button secondary label={uploading===asset.id?progress+'%':'Back up'}
          disabled={busy||Boolean(uploading)||!user.emailVerified||!firebaseStorageReady||uploaded.some(x=>x.endsWith('/'+asset.id))}
          onPress={()=>startUpload(asset)}/>
        </View>)}
      </View>
     </>:<View style={styles.panel}>
      <Text style={styles.heading}>Sign in or create a private account</Text>
      <Text style={styles.info}>This is separate from legacy Google Sheets sign-in. Creating an account does not automatically publish or upload your videos.</Text>
      <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address"
       placeholder="Email" placeholderTextColor="#7F8E98"
       value={email} onChangeText={setEmail} style={styles.input}/>
      <TextInput secureTextEntry autoComplete="password"
       placeholder="Password" placeholderTextColor="#7F8E98"
       value={password} onChangeText={setPassword} style={styles.input}/>
      <View style={styles.buttons}>
       <Button label="Sign in" onPress={()=>{void enter('login');}} disabled={busy}/>
       <Button secondary label="Create account" onPress={()=>{void enter('create');}} disabled={busy}/>
      </View>
     </View>}
    <View style={styles.panel}>
     <Text style={styles.heading}>Storage and billing</Text>
     <Text style={styles.info}>Firebase Hosting can operate on Spark. Cloud Run and Cloud Storage require Google Cloud billing (Blaze). Free usage quotas are not spending caps. No upload starts automatically.</Text>
     <Text style={styles.info}>Google Sheets continues to hold the existing project metadata. Uploading a media file here does not enable multi-device editing or replace the Sheets database.</Text>
    </View>
   </ScrollView>
   {busy||uploading?<View style={styles.busy}><ActivityIndicator color="#35D9E9"/>
      <Text style={styles.info}>{uploading?'Uploading '+progress+'%':'Working…'}</Text></View>:null}
  </KeyboardAvoidingView>
 </Modal>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#11161B'},header:{paddingHorizontal:18,paddingBottom:14,
  flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 title:{fontSize:22,color:'#F8FBFC',fontWeight:'800'},caption:{fontSize:11,color:'#A4B4BF'},
 content:{paddingHorizontal:14,paddingBottom:46,gap:12},
 panel:{backgroundColor:'#222B32',borderRadius:14,padding:15,gap:12},
 heading:{fontSize:16,fontWeight:'750',color:'#F5F7FA'},
 info:{fontSize:12,lineHeight:18,color:'#C0CDD4'},
 input:{borderWidth:1,borderColor:'#48545F',borderRadius:10,padding:12,
  backgroundColor:'#171E24',color:'#F5F8FA',fontSize:14},
 row:{flexDirection:'row',alignItems:'center',gap:8},
 buttons:{flexDirection:'row',flexWrap:'wrap',gap:8},
 button:{paddingHorizontal:13,paddingVertical:11,borderRadius:9,
  backgroundColor:'#2DD4E2',alignItems:'center'},
 secondary:{backgroundColor:'#27323A',borderWidth:1,borderColor:'#60717A'},
 buttonLabel:{fontSize:12,fontWeight:'700',color:'#072A2B'},
 secondaryLabel:{color:'#EAF4F8'},
 asset:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,
  borderBottomWidth:1,borderBottomColor:'#3B474F',paddingVertical:9},
 assetText:{flex:1,color:'#F3F7FA',fontSize:12},
 busy:{paddingVertical:8,flexDirection:'row',justifyContent:'center',gap:9,alignItems:'center'}
});
