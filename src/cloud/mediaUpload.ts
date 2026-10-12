import {File} from 'expo-file-system';
import {ref,uploadBytesResumable,type UploadTaskSnapshot} from 'firebase/storage';
import type {User} from 'firebase/auth';
import type {Asset} from '../domain/timeline';
import {cloudStorage} from './firebaseClient';

export const CLOUD_UPLOAD_LIMIT=25*1024*1024;
function mediaContentType(asset:Asset):string{
 const ext=asset.filename.toLowerCase().split('.').pop();
 const types:Record<string,string>={
  mp4:'video/mp4',mov:'video/quicktime',m4v:'video/mp4',
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav'
 };
 const type=types[ext||''];
 if(!type||!type.startsWith(asset.kind+'/'))
  throw Error('This media type cannot be backed up yet. Export as MP4, JPEG, PNG, M4A, MP3 or WAV.');
 return type;
}
export function cloudMediaPath(userId:string,assetId:string):string {
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)||!/^[a-zA-Z0-9_-]{6,96}$/.test(assetId))
  throw Error('Invalid media reference.');
 return 'users/'+userId+'/media/'+assetId;
}
/**
 * Intentionally limited to 25 MiB while uploads rely on memory-backed blobs.
 * Long HD video needs a streaming native upload pipeline before broad release.
 */
export async function uploadSmallMedia(user:User,asset:Asset,
 onProgress?:(percentage:number)=>void):Promise<string>{
 if(!user?.uid)throw Error('Sign in to Firebase before uploading.');
 if(!asset.uri.startsWith('file://'))throw Error('Only files already stored on this phone can be uploaded.');
 const contentType=mediaContentType(asset);
 const file=new File(asset.uri);
 if(!file.exists)throw Error('The selected source media file was not found on this phone.');
 const size=file.size;
 if(!Number.isFinite(size)||size<=0||size>CLOUD_UPLOAD_LIMIT)
  throw Error('Private cloud beta upload limit is 25 MiB per file. Keep large videos locally for now.');
 const bytes=await file.arrayBuffer();
 if(bytes.byteLength!==size)throw Error('The selected file changed during upload preparation.');
 const path=cloudMediaPath(user.uid,asset.id);
 const storageRef=ref(cloudStorage(),path);
 return await new Promise<string>((resolve,reject)=>{
  const task=uploadBytesResumable(storageRef,bytes,{contentType});
  task.on('state_changed',(snap:UploadTaskSnapshot)=>{
   onProgress?.(Math.round(100*snap.bytesTransferred/Math.max(1,snap.totalBytes)));
  },error=>{
   reject(Error(error.code==='storage/unauthorized' ?
    'Cloud Storage rejected upload permissions. Check your Firebase account and bucket rules.' :
    'Cloud media upload did not finish. Retry when the connection is stable.'));
  },()=>resolve(path));
 });
}
