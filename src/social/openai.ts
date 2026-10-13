import { socialPrompt,parseSocialPostDraft,type SocialPostDraft } from './copy.ts';
import type {Project} from '../domain/timeline.ts';

export const OPENAI_MODEL='gpt-5.4-mini';
type Fetcher=typeof fetch;
export function readResponseText(response:unknown):string {
 if(!response || typeof response!=='object')throw Error('OpenAI returned an invalid response.');
 const obj=response as {output?:Array<{content?:Array<{type?:string;text?:string}>}>;output_text?:string};
 const contents=obj.output?.flatMap(item=>item.content??[])
   .filter(item=>item.type==='output_text'&&typeof item.text==='string').map(item=>item.text!)??[];
 const text=contents.join('') || obj.output_text;
 if(!text)throw Error('OpenAI did not return any text.');
 return text;
}
/**
 * BYOK: user key is transmitted only to OpenAI's official HTTPS endpoint.
 * Store it only through secureStore; never include it in logging or Sheets.
 */
export async function generateSocialPostDraft(project:Project,key:string,
 creativeDirection='',fetcher:Fetcher=fetch):Promise<SocialPostDraft> {
 if(typeof key!=='string'||!key.startsWith('sk-')||key.length<16)
  throw Error('Enter a valid OpenAI API key in Social Studio settings.');
 const content=socialPrompt(project,creativeDirection);
 const fields=['instagram','tiktok','youtube','facebook','linkedin','youtubeTitle'];
 const schema={type:'object',additionalProperties:false,
  properties:Object.fromEntries(fields.map(k=>[k,{type:'string'}])),required:fields};
 let response:Response;
 try {
  response=await fetcher('https://api.openai.com/v1/responses',{
   method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model:OPENAI_MODEL,store:false,
    instructions:content.instructions,input:content.input,
    text:{format:{type:'json_schema',name:'social_posts',strict:true,schema}},
    max_output_tokens:2900})
  });
 }catch {throw Error('Could not contact OpenAI. Check your connection and try again.');}
 if(!response.ok){
  if(response.status===401)throw Error('OpenAI rejected the API key. Check your key in Social Studio.');
  if(response.status===429)throw Error('OpenAI rate or billing limit reached. Check your API account.');
  throw Error('OpenAI could not generate social posts (HTTP '+response.status+').');
 }
 let responseBody:unknown;
 try{responseBody=await response.json();}catch{throw Error('OpenAI returned unreadable data.');}
 const data=readResponseText(responseBody);
 let parsed:unknown;
 try{parsed=JSON.parse(data);}catch{throw Error('OpenAI returned an incomplete draft. Try generating again.');}
 return parseSocialPostDraft(parsed);
}

/** Non-generating credential check for the owner-only device beta. */
export async function testOpenAIKey(key:string,fetcher:Fetcher=fetch):Promise<void>{
 if(!key.startsWith('sk-')||key.length<16)throw Error('Save a valid OpenAI API key first.');
 let response:Response;
 try{response=await fetcher('https://api.openai.com/v1/models/'+OPENAI_MODEL,{
  method:'GET',headers:{Authorization:'Bearer '+key}
 })}catch{throw Error('Cannot reach OpenAI. Check your internet connection.');}
 if(response.status===401)throw Error('OpenAI rejected this API key.');
 if(response.status===403||response.status===404)throw Error('Your API project cannot use '+OPENAI_MODEL+'. Check project access.');
 if(response.status===429)throw Error('Your OpenAI project is rate limited. Check API billing.');
 if(!response.ok)throw Error('OpenAI connection failed (HTTP '+response.status+').');
}
