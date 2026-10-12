import * as SecureStore from 'expo-secure-store';

const apiKey=process.env.EXPO_PUBLIC_FIREBASE_API_KEY||'';
const base=(process.env.EXPO_PUBLIC_CLOUD_API_BASE_URL||'').replace(/\/$/,'');
const TOKEN_KEY='vidnivo-cloud-refresh-v1';
export interface CloudSession {uid:string;email:string}
interface Credentials extends CloudSession {refreshToken:string;idToken:string;expiresAt:number}
let current:Credentials|null=null;
let refreshPending:Promise<Credentials>|null=null;
function configured(){
 if(!apiKey||!/^https:\/\//.test(base))
  throw Error('Cloud account requires a Firebase API key and HTTPS Cloud API URL in the build environment.');
}
async function responseJson(response:Response){
 const json=await response.json().catch(()=>({}));
 if(!response.ok){
  const code=json?.error?.message||json?.error||'Cloud authentication failed.';
  const translated:Record<string,string>={
   EMAIL_EXISTS:'This email already has an account.',
   EMAIL_NOT_FOUND:'Email or password is incorrect.',
   INVALID_PASSWORD:'Email or password is incorrect.',
   INVALID_LOGIN_CREDENTIALS:'Email or password is incorrect.',
   WEAK_PASSWORD:'Choose a stronger password.',
   TOO_MANY_ATTEMPTS_TRY_LATER:'Too many attempts. Try again later.',
   USER_DISABLED:'This account has been disabled.'
  };
  throw Error(translated[code]|| (response.status===401?
   'Your cloud session expired. Sign in again.':'Cloud request failed (HTTP '+response.status+').'));
 }
 return json;
}
async function save(value:Credentials){
 current=value;
 await SecureStore.setItemAsync(TOKEN_KEY,
  JSON.stringify({uid:value.uid,email:value.email,refreshToken:value.refreshToken}));
 return {uid:value.uid,email:value.email};
}
function parseCredentials(json:any):Credentials{
 if(typeof json.localId!=='string'||typeof json.idToken!=='string'||
  typeof json.refreshToken!=='string'||!json.refreshToken||
  !Number.isFinite(Number(json.expiresIn)))throw Error('Invalid cloud sign-in response.');
 return {uid:json.localId,email:json.email||'',idToken:json.idToken,
  refreshToken:json.refreshToken,expiresAt:Date.now()+Number(json.expiresIn)*1000};
}
export async function signInCloud(email:string,password:string,create=false):Promise<CloudSession>{
 configured();
 const reply=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+
  (create?'signUp':'signInWithPassword')+'?key='+encodeURIComponent(apiKey),{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:email.trim(),password,returnSecureToken:true})
 });
 return save(parseCredentials(await responseJson(reply)));
}
async function refreshToken(uid?:string,email?:string):Promise<Credentials>{
 configured();
 const saved=await SecureStore.getItemAsync(TOKEN_KEY);
 if(!saved)throw Error('Sign in to VIDNIVO Cloud first.');
 let credentials:{refreshToken:string;uid:string;email:string};
 try{credentials=JSON.parse(saved);}catch{throw Error('Cloud session is corrupt. Sign in again.');}
 if(!credentials.refreshToken||!credentials.uid)throw Error('Cloud session is incomplete.');
 const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(apiKey),{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(credentials.refreshToken)
 });
 const data=await responseJson(response);
 if(data.user_id!==credentials.uid||!data.id_token||!data.refresh_token)
  throw Error('Cloud session identity changed. Sign in again.');
 const next={uid:credentials.uid,email:credentials.email,
  idToken:data.id_token,refreshToken:data.refresh_token,
  expiresAt:Date.now()+Number(data.expires_in)*1000};
 if(!Number.isFinite(next.expiresAt))throw Error('Invalid refreshed cloud session.');
 await save(next);return next;
}
export async function restoreCloudSession():Promise<CloudSession|null>{
 const stored=await SecureStore.getItemAsync(TOKEN_KEY);
 if(!stored)return null;
 const credentials=await refreshToken();
 return {uid:credentials.uid,email:credentials.email};
}
export async function cloudToken():Promise<string>{
 if(current&&Date.now()+60000<current.expiresAt)return current.idToken;
 if(!refreshPending)refreshPending=refreshToken().finally(()=>{refreshPending=null;});
 return (await refreshPending).idToken;
}
export async function cloudRequest(path:string,init:RequestInit={}):Promise<any>{
 configured();
 if(!path.startsWith('/api/v1/'))throw Error('Unsafe cloud API path.');
 const token=await cloudToken();
 const response=await fetch(base+path,{...init,headers:{
  Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{}),
  ...init.headers
 }});
 return responseJson(response);
}
export async function cloudTransferAuthorization(){
 configured();return {base,token:await cloudToken()};
}
export async function signOutCloud(){
 current=null;
 await SecureStore.deleteItemAsync(TOKEN_KEY);
}
