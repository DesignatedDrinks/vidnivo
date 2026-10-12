import type {User} from 'firebase/auth';
const API_BASE=process.env.EXPO_PUBLIC_VIDNIVO_API_BASE_URL || '';
export const cloudApiConfigured=API_BASE.startsWith('https://') &&
 !API_BASE.includes('example.com') && !API_BASE.includes('localhost');
function endpoint(path:string):string {
 if(!cloudApiConfigured)throw Error('Cloud API has not been deployed. Account sign-in still works locally.');
 return API_BASE.replace(/\/$/,'')+path;
}
export interface CloudProfile {displayName:string;createdAt:string|null;updatedAt:string|null}
export async function fetchAccountProfile(user:User):Promise<CloudProfile|null>{
 const token=await user.getIdToken();
 const response=await fetch(endpoint('/v1/me'),{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(!response.ok){
  if(response.status===401)throw Error('Cloud session expired. Sign in again.');
  throw Error('Cannot fetch your cloud profile. HTTP '+response.status);
 }
 const json=await response.json();
 return json.profile??null;
}
export async function updateAccountProfile(user:User,name:string):Promise<CloudProfile>{
 const displayName=name.trim();
 if(!displayName||displayName.length>80)throw Error('Enter a display name between 1 and 80 characters.');
 const token=await user.getIdToken();
 const response=await fetch(endpoint('/v1/me'),{
  method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({displayName})});
 if(!response.ok)throw Error(response.status===401?'Cloud session expired.':'Could not save your profile. HTTP '+response.status);
 const json=await response.json();
 return json.profile;
}
