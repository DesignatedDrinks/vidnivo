/**
 * Face Retouch for the browser editor.
 * Tracking uses MediaPipe Face Landmarker locally: frames are never uploaded.
 * Skin softening is applied only inside a face-oval mask with eyes, brows and lips excluded.
 * The same drawFrame path supplies the preview and browser MediaRecorder export.
 */
const PACKAGE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22';
const MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FACE=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,160,158,133,153,144],[362,385,387,263,373,380]];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276]];
const MOUTH=[61,40,37,0,267,270,291,321,314,17,84,91];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finitePoint=(p)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function validateFaceMesh(mesh){
 return Array.isArray(mesh)&&mesh.length>=400&&[...FACE,...EYES.flat(),...BROWS.flat(),...MOUTH].every(i=>finitePoint(mesh[i]));
}
export function faceBounds(mesh){
 if(!validateFaceMesh(mesh))return null;
 const pts=FACE.map(i=>mesh[i]),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
 const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(w<.02||h<.02||w>.95||h>.95)return null;
 return {x,y,w,h};
}
function pathPoints(ctx,mesh,indices,frame){
 let started=false;
 for(const i of indices){
  const p=mesh[i];
  if(!finitePoint(p))return false;
  const x=frame.x+p.x*frame.w,y=frame.y+p.y*frame.h;
  if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);
 }
 ctx.closePath();return true;
}
function eraseFeatures(ctx,mesh,indices,frame,padX=1.4,padY=1.6){
 const xs=indices.map(i=>mesh[i].x),ys=indices.map(i=>mesh[i].y);
 const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(!Number.isFinite(x+y+w+h)||w<=0||h<=0)return;
 const cx=frame.x+(x+w/2)*frame.w,cy=frame.y+(y+h/2)*frame.h;
 const radiusX=Math.max(3,w*frame.w*padX/2),radiusY=Math.max(2.5,h*frame.h*padY/2);
 ctx.beginPath();ctx.ellipse(cx,cy,radiusX,radiusY,0,0,Math.PI*2);ctx.fill();
}
function newCanvas(){return document.createElement('canvas')}
function readyCanvas(c,w,h){
 if(c.width!==w)c.width=w;
 if(c.height!==h)c.height=h;
 return c.getContext('2d');
}

/**
 * tracker.draw(...) is called after global colour grade, before captions.
 * The pre-graded frame is captured once from destination canvas and softened;
 * no other part of the frame is modified.
 */
export class FaceRetouch {
 constructor(){
  this.landmarker=null;
  this.loading=null;
  this.meshes=[];
  this.lastScan=0;
  this.lastTime=-1;
  this.lastSource='';
  this.lastWidth=0;
  this.error='';
  this.supported=false;
  this.low=newCanvas();
  this.soft=newCanvas();
  this.mask=newCanvas();
  this.layer=newCanvas();
 }
 async load(onProgress=()=>{}){
  if(this.landmarker)return;
  if(this.loading)return this.loading;
  this.loading=(async()=>{
   onProgress('Downloading private on-device face tracker…');
   const {FaceLandmarker,FilesetResolver}=await import(PACKAGE+'/vision_bundle.mjs');
   const vision=await FilesetResolver.forVisionTasks(PACKAGE+'/wasm');
   onProgress('Preparing face landmarks…');
   this.landmarker=await FaceLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
    runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,
    minFacePresenceConfidence:.55,minTrackingConfidence:.55
   });
   this.supported=true;
  })();
  try{await this.loading}
  catch(e){this.loading=null;this.supported=false;throw e}
 }
 reset(){this.meshes=[];this.lastTime=-1;this.lastScan=0;this.lastSource=''}
 scan(video,source){
  if(!this.landmarker||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
  const now=performance.now();
  if(source!==this.lastSource){
   this.meshes=[];this.lastSource=source;this.lastTime=-1;this.lastScan=0;
  }
  // Rate limit expensive synchronous model execution on low-powered phones.
  if(now-this.lastScan<165&&this.lastTime>=0)return;
  if(Math.abs(video.currentTime-this.lastTime)<.03&&this.lastTime>=0)return;
  this.lastScan=now;this.lastTime=video.currentTime;
  try{
   const result=this.landmarker.detectForVideo(video,now);
   this.meshes=(result?.faceLandmarks||[]).filter(validateFaceMesh).slice(0,1);
   this.error='';
  }catch(e){this.meshes=[];this.error=e?.message||'Face detection failed.'}
 }
 draw(ctx,video,frame,strength,source){
  const amount=clamp(Number(strength)||0,0,100)/100;
  if(!amount||!this.landmarker)return false;
  this.scan(video,source);
  if(!this.meshes.length)return false;
  const canvas=ctx.canvas,width=canvas.width,height=canvas.height;
  if(!width||!height)return false;
  let modified=false;
  for(const mesh of this.meshes){
   const bound=faceBounds(mesh);
   if(!bound)continue;
   // Clip processing to the actual face. No full-frame blur, no skin-colour assumptions.
   const fx=frame.x+bound.x*frame.w,fy=frame.y+bound.y*frame.h;
   const fw=bound.w*frame.w,fh=bound.h*frame.h;
   const x=Math.max(0,Math.floor(fx)),y=Math.max(0,Math.floor(fy));
   const right=Math.min(width,Math.ceil(fx+fw)),bottom=Math.min(height,Math.ceil(fy+fh));
   const w=right-x,h=bottom-y;
   if(w<28||h<32)continue;
   const ratio=.35-amount*.17;
   const sw=Math.max(12,Math.round(w*ratio)),sh=Math.max(12,Math.round(h*ratio));
   const low=readyCanvas(this.low,sw,sh);
   low.imageSmoothingEnabled=true;low.imageSmoothingQuality='high';
   low.clearRect(0,0,sw,sh);low.drawImage(canvas,x,y,w,h,0,0,sw,sh);
   const soft=readyCanvas(this.soft,w,h);
   soft.imageSmoothingEnabled=true;soft.imageSmoothingQuality='high';
   soft.clearRect(0,0,w,h);soft.drawImage(this.low,0,0,sw,sh,0,0,w,h);
   const mask=readyCanvas(this.mask,w,h);
   mask.clearRect(0,0,w,h);
   mask.save();mask.translate(-x,-y);
   mask.fillStyle='#fff';mask.beginPath();pathPoints(mask,mesh,FACE,frame);mask.fill();
   mask.globalCompositeOperation='destination-out';mask.fillStyle='#000';
   for(const eye of EYES)eraseFeatures(mask,mesh,eye,frame,1.6,1.9);
   for(const brow of BROWS)eraseFeatures(mask,mesh,brow,frame,1.2,1.8);
   eraseFeatures(mask,mesh,MOUTH,frame,1.25,1.65);
   mask.restore();
   const layer=readyCanvas(this.layer,w,h);
   layer.clearRect(0,0,w,h);
   layer.drawImage(this.soft,0,0);
   layer.globalCompositeOperation='destination-in';
   layer.drawImage(this.mask,0,0);
   layer.globalCompositeOperation='source-over';
   ctx.save();ctx.globalAlpha=.24+amount*.55;
   ctx.drawImage(this.layer,x,y);
   ctx.restore();modified=true;
  }
  return modified;
 }
}
