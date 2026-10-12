import type {Project} from '../domain/timeline.ts';
export interface CloudReconcileResult {projects:Project[];applied:number;skipped:string[]}
/**
 * Google Sheets sync is metadata-only: never overwrite a usable draft with
 * another phone's unresolvable file:// paths. Cloud media storage and re-link
 * UX are still required for genuine cross-device editing.
 */
export function reconcileCloudProjects(
 local:Project[],remote:Project[],
 isSourceAvailable:(uri:string)=>boolean):CloudReconcileResult {
 const merged=new Map(local.map(p=>[p.id,p]));
 const skipped:string[]=[];
 let applied=0;
 for(const incoming of remote){
  const existing=merged.get(incoming.id);
  if(existing && incoming.revision<=existing.revision)continue;
  const missing=incoming.assets.filter(a=>{
   try{return !a.uri.startsWith('file://')||!isSourceAvailable(a.uri);}
   catch{return true;}
  });
  if(missing.length) {
   skipped.push(incoming.name || incoming.id);
   continue;
  }
  merged.set(incoming.id,incoming);
  applied++;
 }
 return {projects:[...merged.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),
  applied,skipped};
}
