import {Directory,File,Paths} from 'expo-file-system';

export interface SavedVideo {
 uri:string;
 filename:string;
 sizeBytes:number;
 updatedAt:number;
}
const NAME=/^vidnivo-[A-Za-z0-9_-]+\.mp4$/;
function exportsDir(){return new Directory(Paths.document,'vidnivo-exports');}
function validSavedVideo(uri:string){
 const dir=exportsDir().uri.replace(/\/$/,'')+'/';
 return uri.startsWith(dir)&&NAME.test(uri.slice(dir.length));
}
/** Exported MP4s live in app documents, not transient cache.
 * This is not a cloud backup; uninstalling the app may remove these files.
 */
export function listSavedVideos(maxCount=100):SavedVideo[]{
 if(!Number.isSafeInteger(maxCount)||maxCount<1||maxCount>500)
  throw Error('Invalid export library page size.');
 const dir=exportsDir();
 if(!dir.exists)return [];
 return dir.list().filter((entry):entry is File=>
   entry instanceof File&&NAME.test(entry.name)&&entry.exists&&entry.size>1024
 ).map(file=>({
  uri:file.uri,filename:file.name,sizeBytes:file.size,
  updatedAt:file.lastModified||0
 })).sort((a,b)=>b.updatedAt-a.updatedAt||a.filename.localeCompare(b.filename))
 .slice(0,maxCount);
}
export function deleteSavedVideo(uri:string):void{
 if(!validSavedVideo(uri))throw Error('Refusing to delete media outside the VIDNIVO exports library.');
 const file=new File(uri);
 if(!file.exists)throw Error('This export is already missing.');
 file.delete();
}
export function formatExportSize(bytes:number):string{
 return (bytes/(1024*1024)).toFixed(1)+' MB';
}
