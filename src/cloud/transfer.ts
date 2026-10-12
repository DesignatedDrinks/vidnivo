import * as LegacyFS from 'expo-file-system/legacy';
import {Directory,File,Paths} from 'expo-file-system';
import type {Asset,Project} from '../domain/timeline.ts';
import {makeId} from '../domain/timeline.ts';
import {cloudRequest,cloudTransferAuthorization} from './account.ts';
import {MAX_CLOUD_FILE_BYTES,installPortableProject,toPortableProject} from './portable.ts';

type CloudListEntry={id:string;name:string;revision:number;version:number;updatedAt:string;mediaCount:number};
function mediaMime(asset:Asset):string{
 const suffix=asset.filename.toLowerCase().split('.').pop()||'';
 const supported:Record<string,string>={
  mp4:'video/mp4',mov:'video/quicktime',m4v:'video/x-m4v',webm:'video/webm',
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',heic:'image/heic',
  webp:'image/webp',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',
  wav:'audio/wav',ogg:'audio/ogg'
 };
 const mime=supported[suffix];
 if(!mime||!mime.startsWith(asset.kind+'/')&&
    !(asset.kind==='image'&&mime.startsWith('image/'))&&
    !(asset.kind==='audio'&&mime.startsWith('audio/')))
  throw Error('Cloud backup does not support this media format: '+asset.filename);
 return mime;
}
function safeName(original:string){
 const clean=original.replace(/[^A-Za-z0-9_.-]/g,'_').slice(-120);
 return clean||'source.bin';
}
async function mediaChecksum(uri:string):Promise<string>{
 const info=await LegacyFS.getInfoAsync(uri,{md5:true});
 if(!info.exists||typeof info.md5!=='string'||!/^[a-f0-9]{32}$/i.test(info.md5))
  throw Error('Could not calculate the source file integrity checksum.');
 return info.md5.toLowerCase();
}
async function mediaIsRegistered(asset:Asset,size:number,md5Hex:string):Promise<boolean>{
 const {base,token}=await cloudTransferAuthorization();
 const reply=await fetch(base+'/api/v1/media/'+encodeURIComponent(asset.id),
  {headers:{Authorization:'Bearer '+token}});
 if(reply.status===404)return false;
 const json=await reply.json().catch(()=>({}));
 if(!reply.ok)throw Error('Media registry check failed (HTTP '+reply.status+').');
 if(json.size!==size||json.md5Hex!==md5Hex)
  throw Error('Cloud media differs from the original file. Restore or duplicate the project first.');
 return true;
}
async function sendMedia(asset:Asset):Promise<void>{
 const file=new File(asset.uri);
 if(!file.exists||file.size<=0||file.size>MAX_CLOUD_FILE_BYTES)
  throw Error('Cannot back up missing or oversized media: '+asset.filename+' (200 MB limit).');
 const sourceMd5=await mediaChecksum(asset.uri);
 if(await mediaIsRegistered(asset,file.size,sourceMd5))return;
 const {base,token}=await cloudTransferAuthorization();
 const result=await LegacyFS.uploadAsync(
  base+'/api/v1/media/'+encodeURIComponent(asset.id)+'/upload',asset.uri,{
   httpMethod:'PUT',uploadType:LegacyFS.FileSystemUploadType.BINARY_CONTENT,
   mimeType:mediaMime(asset),headers:{
    Authorization:'Bearer '+token,'X-VIDNIVO-FILENAME':safeName(asset.filename),
    'X-VIDNIVO-SIZE':String(file.size)
   }
  });
 if(result.status!==200&&result.status!==201)
  throw Error('Cloud media upload failed (HTTP '+result.status+'). Retry safely.');
 let stored:any;
 try{stored=JSON.parse(result.body);}catch{throw Error('Cloud upload did not confirm its checksum.');}
 if(stored.md5Hex!==sourceMd5||stored.size!==file.size)
  throw Error('Cloud media integrity verification failed. The original file is still on this phone.');
}
export async function backUpCloudProject(project:Project):Promise<number>{
 const portable=toPortableProject(project);
 for(const asset of project.assets)await sendMedia(asset);
 const result=await cloudRequest('/api/v1/projects/'+encodeURIComponent(project.id),{
  method:'PUT',body:JSON.stringify({baseVersion:project.cloudVersion??0,project:portable})
 });
 if(!Number.isSafeInteger(result.version)||result.version<1)
  throw Error('Cloud backup did not return a valid revision.');
 return result.version;
}
export async function listCloudProjects():Promise<CloudListEntry[]>{
 const result=await cloudRequest('/api/v1/projects');
 if(!Array.isArray(result.projects))throw Error('Invalid cloud projects response.');
 return result.projects as CloudListEntry[];
}
export async function restoreProjectFromCloud(id:string):Promise<Project>{
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw Error('Invalid cloud project.');
 const result=await cloudRequest('/api/v1/projects/'+encodeURIComponent(id));
 const remote=result.project as Project,version=result.version as number;
 // Validate the remote payload before downloading, and again after conversion.
 const portable=toPortableGuard(remote);
 const folder=new Directory(Paths.document,'vidnivo-cloud-media');
 await folder.create({idempotent:true,intermediates:true});
 const uris:Record<string,string>={};
 const created:File[]=[];
 try{
  for(const asset of portable.assets){
   const registry=await cloudRequest('/api/v1/media/'+encodeURIComponent(asset.id));
   if(!Number.isSafeInteger(registry.size)||registry.size<1||
      registry.size>MAX_CLOUD_FILE_BYTES||
      !/^[a-f0-9]{32}$/.test(registry.md5Hex||''))
    throw Error('This cloud media has no verifiable checksum: '+asset.filename);
   const {base,token}=await cloudTransferAuthorization();
   const ext=asset.filename.match(/\.[A-Za-z0-9]{1,10}$/)?.[0]||'.bin';
   const target=new File(folder,makeId()+ext);
   created.push(target);
   const download=await LegacyFS.downloadAsync(
    base+'/api/v1/media/'+encodeURIComponent(asset.id)+'/download',
    target.uri,{headers:{Authorization:'Bearer '+token}});
   const file=new File(target.uri);
   if(download.status!==200||!file.exists||file.size!==registry.size||
      file.size<=0||file.size>MAX_CLOUD_FILE_BYTES||
      await mediaChecksum(file.uri)!==registry.md5Hex)
    throw Error('Incomplete or corrupt cloud media download: '+asset.filename);
   uris[asset.id]=file.uri;
  }
  return installPortableProject(portable,uris,version);
 }catch(error){
  for(const file of created){try{if(file.exists)await file.delete();}catch{/* keep original error */}}
  throw error;
 }
}
function toPortableGuard(value:Project):Project{
 // Never trust remote project URIs, even though the server also validates them.
 const fakeUris:Record<string,string>={};
 if(!value||!Array.isArray(value.assets))throw Error('Invalid cloud project.');
 for(const asset of value.assets){
  if(!asset?.id||asset.uri!=='cloud://'+asset.id)
   throw Error('Unexpected cloud source reference.');
  fakeUris[asset.id]='file:///temporary-placeholder';
 }
 installPortableProject(value,fakeUris,1);
 return value;
}
