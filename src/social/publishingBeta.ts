/* Rollblink private-beta mobile publishing client. Never sends provider credentials to device. */
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

export type BetaPlatform='instagram'|'tiktok';
export type BetaAccounts=Record<'instagram'|'youtube'|'tiktok',{connected:boolean;label:string;configured:boolean;pending:boolean}>;
export interface BetaConfig{url:string;accessToken:string}
const KEY_URL='rollblink-beta-api-url',KEY_TOKEN='rollblink-beta-api-token';

function normalizeUrl(value:string){
 const u=new URL(value.trim().replace(/\\/api\\/generate\\/?$/,''));
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='localhost'))throw Error('Use an HTTPS backend URL.');
 return u.origin+u.pathname.replace(/\\/$/,'');
}
export async function getBetaConfig():Promise<BetaConfig|null>{
 const [url,accessToken]=await Promise.all([SecureStore.getItemAsync(KEY_URL),SecureStore.getItemAsync(KEY_TOKEN)]);
 return url&&accessToken?{url,accessToken}:null;
}
export async function saveBetaConfig(config:BetaConfig){
 if(config.accessToken.trim().length<24)throw Error('Enter the separate 24+ character beta access token, not the OpenAI API key.');
 const url=normalizeUrl(config.url);
 await SecureStore.setItemAsync(KEY_URL,url);
 await SecureStore.setItemAsync(KEY_TOKEN,config.accessToken.trim());
}
export async function clearBetaConfig(){
 await Promise.all([SecureStore.deleteItemAsync(KEY_URL),SecureStore.deleteItemAsync(KEY_TOKEN)]);
}
async function config(){
 const v=await getBetaConfig();
 if(!v)throw Error('Save the secure beta backend URL and access token first.');
 return v;
}
async function call(path:string,{method='GET',data}:{method?:string;data?:Record<string,unknown>}={}){
 const v=await config();
 const response=await fetch(v.url+path,{method,headers:{
  Authorization:'Bearer '+v.accessToken,...(data?{'Content-Type':'application/json'}:{})
 },...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json().catch(()=>({})) as Record<string,any>;
 if(!response.ok)throw Error(result.error||'Publishing backend returned '+response.status);
 return result;
}
export async function betaAccounts(){
 const result=await call('/api/social/status');
 return result.platforms as BetaAccounts;
}
export async function betaAuthorizationUrl(platform:BetaPlatform){
 const result=await call('/api/social/connect',{method:'POST',data:{platform}});
 if(typeof result.url!=='string'||!result.url.startsWith('https://'))throw Error('Provider authorization URL unavailable.');
 return result.url as string;
}
export async function betaCreatorPrivacy(){
 const result=await call('/api/social/tiktok/creator');
 return result.privacyOptions as string[];
}
export async function betaUploadMp4(localUri:string){
 if(!localUri.toLowerCase().endsWith('.mp4'))throw Error('Export a valid MP4 before publishing.');
 const v=await config();
 const result=await FileSystem.uploadAsync(v.url+'/api/media',localUri,{
  httpMethod:'PUT',uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT,
  headers:{Authorization:'Bearer '+v.accessToken,'Content-Type':'video/mp4'}
 });
 const data=JSON.parse(result.body||'{}') as Record<string,any>;
 if(result.status<200||result.status>=300)throw Error(data.error||'MP4 transfer failed: '+result.status);
 if(typeof data.mediaId!=='string')throw Error('Server did not confirm the video upload.');
 return data.mediaId as string;
}
export async function betaPublish(platform:BetaPlatform,input:{mediaId:string;caption:string;privacy?:string;ownBrand?:boolean;aiGenerated?:boolean}){
 return call('/api/social/publish',{method:'POST',data:{platform,...input}});
}
export async function betaCompleteInstagram(){
 return call('/api/social/instagram/complete',{method:'POST',data:{}});
}
export async function betaTikTokStatus(publishId:string){
 return call('/api/social/tiktok/status',{method:'POST',data:{publishId}});
}
