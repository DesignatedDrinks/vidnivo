import type {Project,TextLayer} from './timeline.ts';
/** Literal substring replacement, not regular-expression interpretation.
 * Only subtitle layers are touched; titles and layer timing are preserved.
 */
export function replaceCaptionPhrase(p:Project,find:string,replacement:string,
  caseSensitive=false):{project:Project;count:number} {
 if(typeof find!=='string'||!find.trim()||find.length>100)throw Error('Enter a search phrase up to 100 characters.');
 if(typeof replacement!=='string'||replacement.length>200)throw Error('Replacement text must be shorter than 201 characters.');
 const escaped=find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const regex=new RegExp(escaped,caseSensitive?'g':'gi');
 let count=0;
 const texts:TextLayer[]=p.texts.map(t=>{
   if(t.role==='title')return t;
   const occurrences=t.text.match(regex)?.length??0;
   if(!occurrences)return t;
   const nextText=t.text.replace(regex,()=>replacement);
   if(!nextText.trim())throw Error('Replacement cannot make an entire caption empty.');
   if(nextText.length>500)throw Error('A revised caption would exceed 500 characters.');
   count+=occurrences;
   return {...t,text:nextText};
 });
 return count?{project:{...p,texts,revision:p.revision+1,updatedAt:new Date().toISOString()},count}:{project:p,count:0};
}
