import type {CaptionCue} from './captions.ts';

/**
 * Script-to-captions is a timing approximation, NOT speech recognition.
 * Users must review alignment with spoken audio before exporting.
 * Text is split at punctuation and into 4-6 word groups, and allocated
 * across a specified time range with extra weight on longer phrases.
 */
export function generateCaptionsFromScript(script:string,startMs:number,endMs:number,maxWords=5):CaptionCue[] {
  if(typeof script!=='string'||script.length>30000)
    throw Error('Script must be text under 30,000 characters.');
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs)
    throw Error('Choose a valid video time range.');
  if(!Number.isInteger(maxWords)||maxWords<1||maxWords>10)
    throw Error('Caption groups must contain 1–10 words.');
  const tokens=script.replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  if(!tokens.length)throw Error('Enter a script to create captions.');
  const parts:string[][]=[];
  let segment:string[]=[];
  for(const token of tokens){
    segment.push(token);
    if(segment.length>=maxWords || /[.!?…]$/.test(token)){
      parts.push(segment);
      segment=[];
    }
  }
  if(segment.length)parts.push(segment);
  if(parts.length>500)throw Error('This script creates too many captions. Split it into shorter sections.');
  const available=Math.round(endMs-startMs);
  if(available < parts.length*250)
    throw Error('Video is too short for this many caption groups.');
  const weights=parts.map(words=>
    Math.max(1,words.reduce((sum,w)=>sum+Math.max(1,w.replace(/[^\p{L}\p{N}]/gu,'').length)/5,0)
      + (/[.!?…]$/.test(words[words.length-1]) ? .5 : 0)));
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  const free=available-parts.length*250;
  const fractional=weights.map(w=>free*w/totalWeight);
  const durations=fractional.map(w=>Math.floor(w)+250);
  let remainder=available-durations.reduce((a,b)=>a+b,0);
  for(let i=0;remainder>0;i=(i+1)%durations.length,remainder--)durations[i]++;
  let cursor=Math.round(startMs);
  return parts.map((words,i)=>{
    const cue={startMs:cursor,endMs:cursor+durations[i],text:words.join(' ')};
    cursor=cue.endMs;
    return cue;
  });
}
