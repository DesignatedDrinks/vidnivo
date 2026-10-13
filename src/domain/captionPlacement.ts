/* Position and resize subtitles as one visual group. Titles are independent. */
import type {Project} from './timeline.ts';

const bound=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
export type CaptionPlacement={x:number;y:number;fontSize?:number};
export function applyCaptionPlacement(project:Project,placement:CaptionPlacement):Project{
 if(!Number.isFinite(placement.x)||!Number.isFinite(placement.y))return project;
 const x=bound(placement.x,.1,.9),y=bound(placement.y,.12,.88);
 const size=Number.isFinite(placement.fontSize)?bound(placement.fontSize!,14,90):undefined;
 const existing=project.texts.filter(layer=>layer.role!=='title');
 if(!existing.length)return project;
 const texts=project.texts.map(layer=>layer.role==='title'?layer:{
  ...layer,x,y,...(size===undefined?{}:{fontSize:size})
 });
 if(texts.every((layer,i)=>layer.x===project.texts[i].x&&layer.y===project.texts[i].y
  &&layer.fontSize===project.texts[i].fontSize))return project;
 return {...project,texts,updatedAt:new Date().toISOString(),revision:project.revision+1};
}
