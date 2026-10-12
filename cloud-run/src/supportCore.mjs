// Server-owned AI support policy: only a small reversible device-action
// allowlist can be suggested. Language-model output is NEVER executable code.
export const FIX_ACTIONS=['none','retry-save','restart-preview','set-export-720'];
const AREA=['projects','editor','export','cloud','captions','audio','other'];
const PLATFORM=['ios','android','web'];
const clampedCount=v=>Number.isSafeInteger(v)&&v>=0&&v<=2000?v:0;
export function validateSupportInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  typeof raw.issue!=='string'||raw.issue.trim().length<5||raw.issue.length>1200)
  throw Object.assign(Error('Describe the problem in 5–1200 characters.'),{status:400});
 const rawContext=raw.diagnostics;
 if(!rawContext||typeof rawContext!=='object'||Array.isArray(rawContext))
  throw Object.assign(Error('Safe app diagnostics are required.'),{status:400});
 const screen=AREA.includes(rawContext.screen)?rawContext.screen:'other';
 const platform=PLATFORM.includes(rawContext.platform)?rawContext.platform:'web';
 const quality=[720,1080].includes(rawContext.quality)?rawContext.quality:1080;
 const diagnostics={screen,platform,quality,clipCount:clampedCount(rawContext.clipCount),
  mediaCount:clampedCount(rawContext.mediaCount),
  missingSourceCount:clampedCount(rawContext.missingSourceCount),
  saveFailed:rawContext.saveFailed===true,
  exportSupported:rawContext.exportSupported===true,
  cloudSignedIn:rawContext.cloudSignedIn===true};
 return {issue:raw.issue.trim(),diagnostics};
}
export function supportFallback({issue,diagnostics}){
 const query=issue.toLowerCase();
 if(diagnostics.saveFailed||/(can't|cannot|wont|won't|not|failed|error).{0,30}sav(e|ing)/.test(query))
  return {answer:'The editor detected a local save problem. I can safely retry saving your current draft without deleting anything. If storage is full, free space on the device first.',action:'retry-save',category:'storage'};
 if(diagnostics.missingSourceCount>0||/missing (file|media|video|photo)/.test(query))
  return {answer:'A source file used by this project is missing from this device. Nothing has been deleted. Restore the project from VIDNIVO Cloud, or import the original footage again. A code change cannot recreate missing footage.',action:'none',category:'media'};
 if(/(export|render|mp4)/.test(query)){
  if(!diagnostics.exportSupported)return {
   answer:'MP4 export requires an installed VIDNIVO native iOS/Android build. Expo Go does not contain the video encoder, and changing quality will not fix that.',action:'none',category:'export'};
  return {answer:'I can switch the next export to 720p to reduce rendering pressure. Your original clips and editing timeline will stay unchanged. Try another export and check the finished video.',action:'set-export-720',category:'export'};
 }
 if(/(preview|playback|freez|stuck|black screen)/.test(query))
  return {answer:'I can reset the editor playback state without touching the source clips or saved edits. If the preview still does not play, confirm the original video file is present.',action:'restart-preview',category:'playback'};
 if(/(cloud|sign in|login|sync|account|backup|restore)/.test(query))
  return {answer:'Check that you are signed into VIDNIVO Cloud on both devices. Backups must finish before the other phone can restore a project. Google Sheets sync alone does not transfer media files.',action:'none',category:'account'};
 return {answer:'I can check the project and app diagnostics, but this report does not match a known safe automatic repair. Describe what you tapped, what happened, and what you expected. Your original project remains unchanged.',action:'none',category:'other'};
}
export function cleanDiagnosis(data,fallback){
 if(!data||typeof data!=='object')return {...fallback,aiGenerated:false};
 const action=FIX_ACTIONS.includes(data.action)?data.action:'none';
 const answer=typeof data.answer==='string'?data.answer.trim():'';
 const category=['storage','media','export','playback','account','captions','audio','other']
  .includes(data.category)?data.category:'other';
 if(!answer||answer.length>1200)return {...fallback,aiGenerated:false};
 return {answer,action,category,aiGenerated:true};
}
export const SUPPORT_INSTRUCTIONS=`You are the built-in VIDNIVO video editor support assistant.
Help a nontechnical creator solve the issue quickly and respectfully.
Work only from the provided bounded diagnostics and the user's description.
Never claim you saw private video, device logs, cloud records or source code.
Never claim a bug or production source code was fixed, patched or deployed.
Choose action only from none, retry-save, restart-preview, set-export-720.
These actions operate on local reversible state only. Do not propose destructive
changes, permission bypasses, arbitrary scripts, personal data sharing, or
cloud/database/source code mutations. A missing source cannot be recovered by AI.
If problem needs a product code change say it is not an instant in-app repair.
Do not ask user for password, API key, private video or authentication tokens.
Keep answer short, concrete, and specific to video editing.`;
const responseText=result=>(result.output||[]).flatMap(x=>x.content||[])
 .filter(x=>x.type==='output_text'&&typeof x.text==='string')
 .map(x=>x.text).join('')||result.output_text||'';
export async function diagnoseWithOpenAI(raw,{apiKey,fetcher=fetch,model='gpt-5-mini'}={}){
 const input=validateSupportInput(raw),fallback=supportFallback(input);
 if(!apiKey)return {...fallback,aiGenerated:false,available:false};
 const schema={type:'object',additionalProperties:false,properties:{
  answer:{type:'string'},action:{type:'string',enum:FIX_ACTIONS},
  category:{type:'string',enum:['storage','media','export','playback','account','captions','audio','other']}
 },required:['answer','action','category']};
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{
   method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model,store:false,instructions:SUPPORT_INSTRUCTIONS,
    input:JSON.stringify(input),max_output_tokens:500,
    text:{format:{type:'json_schema',name:'vidnivo_support',strict:true,schema}}})
  });
  if(!response.ok)return {...fallback,aiGenerated:false,available:false};
  const body=await response.json();
  const modelResult=cleanDiagnosis(JSON.parse(responseText(body)),fallback);
  return {...modelResult,available:modelResult.aiGenerated};
 }catch{return {...fallback,aiGenerated:false,available:false};}
}
