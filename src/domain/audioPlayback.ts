import {type Clip,type Project,clipEndMs} from './timeline.ts';
export interface AudibleTrack {clip:Clip;uri:string;offsetSeconds:number}
/** Keep all active soundtrack/voiceover layers; do not arbitrarily select one. */
export function audibleClipsAt(p:Project,playheadMs:number):AudibleTrack[] {
  if(!Number.isFinite(playheadMs) || playheadMs < 0)return [];
  const byId = new Map(p.assets.map(a=>[a.id,a]));
  return p.clips.filter(c=>c.track==='audio' && !c.muted &&
    c.volume>0 && playheadMs>=c.startMs && playheadMs<clipEndMs(c))
    .map(c=>{
      const asset=byId.get(c.assetId);
      if(!asset||asset.kind!=='audio')return null;
      return {clip:c,uri:asset.uri,
        offsetSeconds:Math.max(0,(c.inMs+(playheadMs-c.startMs)*c.speed)/1000)};
    }).filter((entry):entry is AudibleTrack=>entry!==null);
}
