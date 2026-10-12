/* VIDNIVO — caption layout geometry, independent of viewport pixel density.
 * Every caption stores a normalized anchor and fontScale so on-screen finger
 * adjustments render exactly the same at 720p and 1080p export.
 */
export const CAPTION_MIN_SCALE=.55;
export const CAPTION_MAX_SCALE=2.4;
export const bound=(n,low,high)=>Math.max(low,Math.min(high,n));
export function fontScale(value){
 const n=Number(value);
 return Number.isFinite(n)?bound(n,CAPTION_MIN_SCALE,CAPTION_MAX_SCALE):1;
}
export function captionAnchor(cap){
 if(Number.isFinite(cap?.x)&&Number.isFinite(cap?.y))
  return {x:bound(cap.x,0,1),y:bound(cap.y,0,1)};
 return {x:.5,y:cap?.position==='top'?.17:cap?.position==='middle'?.53:.8};
}
export function pointInCaption(point,bounds,minimumHit=32){
 const extraX=Math.max(0,(minimumHit-bounds.width)/2);
 const extraY=Math.max(0,(minimumHit-bounds.height)/2);
 return point.x>=bounds.left-extraX&&point.x<=bounds.right+extraX&&
        point.y>=bounds.top-extraY&&point.y<=bounds.bottom+extraY;
}
export function gestureDistance(a,b){
 return Math.hypot(b.x-a.x,b.y-a.y);
}
export function midpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
export function captionLayout(ctx,cap,width,height){
 const text=String(cap.text||'').trim();
 const size=Math.max(19,width*.051)*fontScale(cap.fontScale);
 const leading=size*1.35;
 ctx.font='900 '+size.toFixed(2)+'px system-ui,sans-serif';
 const lines=[];
 let line='';
 for(const word of text.split(/\s+/)){
  if(!word)continue;
  const candidate=line?line+' '+word:word;
  if(line&&ctx.measureText(candidate).width>width*.84){lines.push(line);line=word;}
  else line=candidate;
 }
 if(line)lines.push(line);
 const show=lines.slice(0,5);
 const widest=Math.max(0,...show.map(text=>ctx.measureText(text).width));
 const maxWidth=width*.9;
 const boxWidth=Math.min(maxWidth,Math.max(size*2.5,widest+size*.65));
 const boxHeight=Math.min(height*.92,Math.max(size*1.55,show.length*leading+size*.48));
 const anchor=captionAnchor(cap);
 const x=bound(anchor.x*width,boxWidth/2,width-boxWidth/2);
 const y=bound(anchor.y*height,boxHeight/2,height-boxHeight/2);
 return {
  text,lines:show,size,leading,x,y,
  bounds:{left:x-boxWidth/2,top:y-boxHeight/2,right:x+boxWidth/2,
    bottom:y+boxHeight/2,width:boxWidth,height:boxHeight}
 };
}
export function clampedCaptionAnchor(x,y,layout,width,height){
 return {
  x:bound(x,layout.bounds.width/2,width-layout.bounds.width/2)/width,
  y:bound(y,layout.bounds.height/2,height-layout.bounds.height/2)/height
 };
}
