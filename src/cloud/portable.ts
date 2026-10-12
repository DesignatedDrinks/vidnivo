import type {Project} from '../domain/timeline.ts';
import {validateProject} from '../domain/timeline.ts';
const ID=/^[A-Za-z0-9_-]{8,80}$/;
export const MAX_CLOUD_FILE_BYTES=200*1024*1024;
export const cloudUri=(assetId:string)=>'cloud://'+assetId;
export function toPortableProject(project:Project):Project{
 validateProject(project);
 if(project.assets.length>200)throw Error('A cloud project supports at most 200 media assets.');
 const assets=project.assets.map(a=>{
  if(!ID.test(a.id)||!a.uri.startsWith('file://'))
   throw Error('Cloud backup requires local media and valid asset identifiers.');
  return {...a,uri:cloudUri(a.id)};
 });
 const portable={...project,assets};
 delete portable.cloudVersion;
 validateProject(portable);
 return portable;
}
export function installPortableProject(remote:Project,uris:Record<string,string>,cloudVersion:number):Project{
 if(!Number.isSafeInteger(cloudVersion)||cloudVersion<1)
  throw Error('Invalid cloud project version.');
 validateProject(remote);
 const assets=remote.assets.map(a=>{
  if(!ID.test(a.id)||a.uri!==cloudUri(a.id)||typeof uris[a.id]!=='string'||
     !uris[a.id].startsWith('file://'))
   throw Error('A cloud project media file could not be safely restored.');
  return {...a,uri:uris[a.id]};
 });
 const local={...remote,assets,cloudVersion};
 validateProject(local);
 return local;
}
export function restoredName(name:string){return name.endsWith(' (restored copy)')?name:name+' (restored copy)';}
