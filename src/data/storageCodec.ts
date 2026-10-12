import type {Project} from '../domain/timeline.ts';
import {validateProject} from '../domain/timeline.ts';
const MAX_PROJECTS=500;
const MAX_BYTES=25*1024*1024;
export function encodeProjects(projects:Project[]):string {
  if(!Array.isArray(projects)||projects.length>MAX_PROJECTS)
    throw new Error('Project library exceeds safe local storage limits.');
  projects.forEach(validateProject);
  const text=JSON.stringify(projects);
  if(text.length>MAX_BYTES)throw new Error('Project library metadata exceeds safe local storage limits.');
  return text;
}
export function decodeProjects(raw:string):Project[] {
  if(typeof raw!=='string'||raw.length>MAX_BYTES)
    throw new Error('Invalid project library size.');
  let parsed:unknown;
  try { parsed=JSON.parse(raw); } catch { throw new Error('Project database is not valid JSON.'); }
  if(!Array.isArray(parsed)||parsed.length>MAX_PROJECTS)
    throw new Error('Project library has an invalid structure.');
  for(const item of parsed){
    if(!item || typeof item!=='object')throw new Error('Project library includes an invalid project.');
    const p=item as Project;
    if(!p.id||typeof p.id!=='string'||!Array.isArray(p.assets)||
       !Array.isArray(p.clips)||!Array.isArray(p.texts)||
       !Number.isFinite(p.revision)||p.revision<1)
      throw new Error('Project library includes incomplete project metadata.');
    validateProject(p);
  }
  return parsed as Project[];
}
