import {Directory,File,Paths} from 'expo-file-system';

export interface SavedVideo {
 uri:string;
 filename:string;
 sizeBytes:number;
 updatedAt:number;
 title:string;
 durationMs:number|null;
 resolution:string;
}
export interface SavedVideoDetails {
 title:string;durationMs:number;quality:720|1080;ratio:'9:16'|'16:9'|'1:1';
}
const NAME=/^vidnivo-[A-Za-z0-9_-]+\.mp4$/;
function exportsDir(){return new Directory(Paths.document,'vidnivo-exports');}
function metadataFile(uri:string):File{
 if(!validSavedVideo(uri))throw Error('Invalid export library location.');
 return new File(uri.replace(/\.mp4$/,'.json'));
}
export function saveVideoDetails(uri:string,details:SavedVideoDetails):void{
 if(!validSavedVideo(uri))throw Error('Video was not saved to the VIDNIVO exports folder.');
 const original=new File(uri);
 if(!original.exists||original.size<=1024)
  throw Error('Cannot describe a missing or unfinished MP4.');
 if(typeof details.title!=='string'||!details.title.trim()||
   details.title.length>180||!Number.isSafeInteger(details.durationMs)||
   details.durationMs<=0||![720,1080].includes(details.quality)||
   !['9:16','16:9','1:1'].includes(details.ratio))
  throw Error('Invalid export details.');
 const file=metadataFile(uri);
 file.create({overwrite:true});
 file.write(JSON.stringify({
  title:details.title,durationMs:details.durationMs,
  quality:details.quality,ratio:details.ratio
 }));
}
function readVideoDetails(uri:string):Partial<SavedVideoDetails>{
 try{
  const meta=metadataFile(uri);
  if(!meta.exists||meta.size>2048)return {};
  const json=JSON.parse(meta.textSync());
  if(!json||typeof json.title!=='string'||json.title.length>180||
    !Number.isSafeInteger(json.durationMs)||json.durationMs<=0||
    ![720,1080].includes(json.quality)||
    !['9:16','16:9','1:1'].includes(json.ratio))return {};
  return json;
 }catch{return {};}
}
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
 ).map(file=>{
  const details=readVideoDetails(file.uri);
  return {uri:file.uri,filename:file.name,sizeBytes:file.size,
   updatedAt:file.lastModified||0,title:details.title||'Finished video',
   durationMs:details.durationMs||null,
   resolution:details.quality?details.quality+'p · '+details.ratio:'MP4'};
 }).sort((a,b)=>b.updatedAt-a.updatedAt||a.filename.localeCompare(b.filename))
 .slice(0,maxCount);
}
export function deleteSavedVideo(uri:string):void{
 if(!validSavedVideo(uri))throw Error('Refusing to delete media outside the VIDNIVO exports library.');
 const file=new File(uri);
 if(!file.exists)throw Error('This export is already missing.');
 file.delete();
 try{
  const metadata=metadataFile(uri);
  if(metadata.exists)metadata.delete();
 }catch{/* The MP4 was already removed; leave a harmless metadata orphan. */}
}
export function formatExportSize(bytes:number):string{
 return (bytes/(1024*1024)).toFixed(1)+' MB';
}
