/** ROLLBLINK brand overlays. Drawn directly into the shared canvas used for
 * preview AND MediaRecorder export. No external font or image load is needed.
 * Logo asset: rollblink-mark.svg. Browser-safe canvas equivalent below.
 */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const DEFAULT_WATERMARK={enabled:true,position:'bottom-right',opacity:.62};
export const WATERMARK_POSITIONS=['bottom-right','top-left'];
export function normalizeWatermark(raw){
 const obj=raw&&typeof raw==='object'?raw:{};
 return {
  enabled:obj.enabled!==false,
  position:WATERMARK_POSITIONS.includes(obj.position)?obj.position:'bottom-right',
  opacity:Number.isFinite(Number(obj.opacity))?clamp(Number(obj.opacity),.25,.9):.62
 };
}
export function watermarkGeometry(width,height,position='bottom-right'){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
  throw Error('A valid video canvas is required for watermark rendering.');
 const f=clamp(Math.min(width,height)*.024,11,30);
 const heightPx=f*2.25,bodyWidth=f*9.9;
 const padding=clamp(width*.035,16,42);
 const x=position==='top-left'?padding:width-padding-bodyWidth;
 const y=position==='top-left'?padding:height-padding-heightPx;
 return {x,y,width:bodyWidth,height:heightPx,fontSize:f,iconSize:f*1.4,padding};
}
function rounded(ctx,x,y,w,h,r){
 ctx.beginPath();
 if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);
 else {
  const k=Math.min(r,w/2,h/2);
  ctx.moveTo(x+k,y);ctx.lineTo(x+w-k,y);ctx.quadraticCurveTo(x+w,y,x+w,y+k);
  ctx.lineTo(x+w,y+h-k);ctx.quadraticCurveTo(x+w,y+h,x+w-k,y+h);
  ctx.lineTo(x+k,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-k);
  ctx.lineTo(x,y+k);ctx.quadraticCurveTo(x,y,x+k,y);ctx.closePath();
 }
}
export function drawBrandWatermark(ctx,raw=DEFAULT_WATERMARK){
 const options=normalizeWatermark(raw);
 if(!options.enabled)return null;
 const width=ctx?.canvas?.width,height=ctx?.canvas?.height;
 const g=watermarkGeometry(width,height,options.position);
 ctx.save();ctx.globalAlpha=options.opacity;
 rounded(ctx,g.x,g.y,g.width,g.height,g.height*.36);
 ctx.fillStyle='rgba(5,12,23,0.75)';ctx.fill();
 ctx.strokeStyle='rgba(194,226,245,0.28)';ctx.lineWidth=Math.max(.8,g.fontSize*.055);ctx.stroke();
 const iconX=g.x+g.fontSize*.75,iconY=g.y+(g.height-g.iconSize)/2;
 const mark=ctx.createLinearGradient?ctx.createLinearGradient(iconX,iconY,iconX+g.iconSize,iconY+g.iconSize):null;
 if(mark){mark.addColorStop(0,'#9FE7F4');mark.addColorStop(.6,'#71C6FF');mark.addColorStop(1,'#A89AFF')}
 ctx.strokeStyle=mark||'#8CDAF7';
 ctx.lineWidth=g.iconSize*.23;
 ctx.lineJoin='round';ctx.lineCap='round';
 ctx.beginPath();
 ctx.moveTo(iconX+g.iconSize*.07,iconY+g.iconSize*.18);
 ctx.lineTo(iconX+g.iconSize*.48,iconY+g.iconSize*.86);
 ctx.lineTo(iconX+g.iconSize*.94,iconY+g.iconSize*.16);
 ctx.stroke();
 ctx.textAlign='left';ctx.textBaseline='middle';
 ctx.font='750 '+Math.round(g.fontSize)+'px -apple-system,system-ui,Arial,sans-serif';
 ctx.fillStyle='#F2FAFF';
 ctx.fillText('ROLLBLINK',iconX+g.iconSize*1.25,g.y+g.height/2);
 ctx.restore();
 return {x:g.x,y:g.y,width:g.width,height:g.height};
}
