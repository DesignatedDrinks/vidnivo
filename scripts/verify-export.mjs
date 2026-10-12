#!/usr/bin/env node
/**
 * Physical-device QA companion: copy a VIDNIVO-exported MP4 from an iPhone or
 * Android phone to a machine with FFmpeg/FFprobe installed, then run:
 * node scripts/verify-export.mjs ./render.mp4 --expect-audio --expected-seconds=12
 *
 * This checks the actual encoded file, NOT a mock native render. A passing
 * check does not replace watching subtitles, lip sync, trims or audio timing.
 */
import {spawnSync} from 'node:child_process';
import {statSync} from 'node:fs';
const [path,...flags]=process.argv.slice(2);
if(!path||flags.includes('--help')){
 console.log('Usage: node scripts/verify-export.mjs VIDEO.mp4 [--expect-audio] [--expected-seconds=N]');
 process.exit(path?0:2);
}
const fail=msg=>{console.error('FAIL: '+msg);process.exit(1);};
let size=0;
try{size=statSync(path).size;}catch{fail('File does not exist.');}
if(size<1024)fail('Exported file is too small.');
const probe=spawnSync('ffprobe',['-v','error','-show_format','-show_streams',
 '-of','json',path],{encoding:'utf8',maxBuffer:8*1024*1024});
if(probe.error)fail('Install ffprobe (FFmpeg). '+probe.error.message);
if(probe.status!==0)fail('Cannot probe encoded MP4: '+probe.stderr);
let media;
try{media=JSON.parse(probe.stdout);}catch{fail('Invalid ffprobe response.');}
if(!(media.format?.format_name||'').includes('mp4'))
 fail('Expected an MP4 container.');
const video=(media.streams||[]).find(x=>x.codec_type==='video');
const audio=(media.streams||[]).find(x=>x.codec_type==='audio');
if(!video||!Number(video.width)||!Number(video.height))
 fail('Missing video stream or invalid dimensions.');
if(video.codec_name!=='h264')fail('Expected broadly compatible H.264 video.');
const seconds=Number(media.format?.duration);
if(!Number.isFinite(seconds)||seconds<.25)fail('Invalid movie duration.');
const expectedFlag=flags.find(x=>x.startsWith('--expected-seconds='));
if(expectedFlag){
 const expected=Number(expectedFlag.split('=')[1]);
 if(!Number.isFinite(expected)||expected<=0)fail('Invalid expected duration.');
 if(Math.abs(seconds-expected)>.30)fail('Wrong duration: '+seconds+' seconds, expected '+expected+'.');
}
if(flags.includes('--expect-audio')&&!audio)fail('Expected audio stream is missing.');
const decoded=spawnSync('ffmpeg',['-v','error','-xerror','-i',path,
 '-map','0:v:0','-f','null','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
if(decoded.error)fail('Install ffmpeg. '+decoded.error.message);
if(decoded.status!==0)fail('Video decoder found invalid frames: '+decoded.stderr);
console.log(JSON.stringify({
 result:'PASS',file:path,bytes:size,durationSeconds:seconds,
 video:{codec:video.codec_name,width:video.width,height:video.height,
  frameRate:video.avg_frame_rate},
 audio:audio?{codec:audio.codec_name,channels:audio.channels}:null
},null,2));
console.log('Still required: inspect the full movie and captions on an actual phone.');
