/** Cross-platform verification of the MP4 container written by native exporters.
 * A file on disk is not proof that a playable, correctly sized movie exists.
 * The native inspectors read the encoded MP4's actual track metadata.
 */
export interface NativeExportMetadata {
 durationMs:number;
 width:number;
 height:number;
 videoTracks:number;
 audioTracks:number;
 bytes:number;
}
export interface ExpectedExport {
 durationMs:number;
 width:number;
 height:number;
 clipCount:number;
 expectImportedAudio:boolean;
}
const positiveInt=(n:unknown):n is number=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
export function assertPlayableExport(meta:unknown,expected:ExpectedExport):asserts meta is NativeExportMetadata{
 if(!meta||typeof meta!=='object'||Array.isArray(meta))
  throw Error('The exported MP4 does not contain inspectable media metadata.');
 const m=meta as Partial<NativeExportMetadata>;
 if(!positiveInt(m.bytes)||m.bytes<1024||!positiveInt(m.durationMs)||
  !positiveInt(m.width)||!positiveInt(m.height)||!positiveInt(m.videoTracks)||
  typeof m.audioTracks!=='number'||!Number.isSafeInteger(m.audioTracks)||m.audioTracks<0)
  throw Error('The exported MP4 is incomplete or has no playable video track.');
 if(m.width!==expected.width||m.height!==expected.height)
  throw Error('Exported video dimensions are incorrect. Expected '+
   expected.width+' × '+expected.height+' but got '+m.width+' × '+m.height+'.');
 const tolerance=Math.min(5000,Math.max(500,300+expected.clipCount*45));
 if(Math.abs(m.durationMs-expected.durationMs)>tolerance)
  throw Error('Exported MP4 duration differs from the timeline by '+
   (Math.abs(m.durationMs-expected.durationMs)/1000).toFixed(2)+
   's. The render cannot be trusted.');
 if(expected.expectImportedAudio&&m.audioTracks<1)
  throw Error('The export is missing its imported audio or voiceover track.');
}
export function expectedExport(plan:{
 durationMs:number;width:number;height:number;
 clips:Array<{track:string;muted:boolean;volume:number;startMs:number}>
}):ExpectedExport{
 return {
  durationMs:plan.durationMs,width:plan.width,height:plan.height,
  clipCount:plan.clips.filter(c=>c.track==='video').length,
  expectImportedAudio:plan.clips.some(c=>c.track==='audio'&&!c.muted&&
   c.volume>0&&c.startMs<plan.durationMs)
 };
}
