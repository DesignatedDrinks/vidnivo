/* ROLLBLINK colour renderer. Uses GPU shaders for Safari/Chrome; falls back
 * to a software conversion when the browser refuses a video-texture upload.
 * Shared by preview and recorded export; captions are composited afterwards.
 */
let renderer;
function makeRenderer(){
 const surface=document.createElement('canvas');
 const gl=surface.getContext('webgl',{alpha:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
 if(!gl)return null;
 function shader(type,body){
  const s=gl.createShader(type);gl.shaderSource(s,body);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
  return s;
 }
 const vertex='attribute vec2 p; varying vec2 uv; void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);}';
 const fragment=`
 precision mediump float;
 varying vec2 uv;
 uniform sampler2D frame;
 uniform vec3 adjust;
 uniform vec3 tone;
 uniform float hue;
 void main(){
  vec3 c=texture2D(frame,uv).rgb;
  c=clamp(((c-.5)*adjust.y+.5)*adjust.x,0.0,1.0);
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(l),c,adjust.z);
  vec3 sep=vec3(dot(c,vec3(.393,.769,.189)),dot(c,vec3(.349,.686,.168)),dot(c,vec3(.272,.534,.131)));
  c=mix(c,sep,tone.x);
  float yy=dot(c,vec3(.299,.587,.114));
  float ii=dot(c,vec3(.596,-.274,-.322));
  float qq=dot(c,vec3(.211,-.523,.312));
  float ni=ii*cos(hue)-qq*sin(hue);
  float nq=ii*sin(hue)+qq*cos(hue);
  c=vec3(yy+.956*ni+.621*nq,yy-.272*ni-.647*nq,yy-1.106*ni+1.703*nq);
  c=mix(c,vec3(dot(c,vec3(.2126,.7152,.0722))),tone.y);
  gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
 }`;
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
 gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 const pos=gl.getAttribLocation(program,'p'),buffer=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.uniform1i(gl.getUniformLocation(program,'frame'),0);
 return {surface,gl,texture,program,
  adj:gl.getUniformLocation(program,'adjust'),
  tone:gl.getUniformLocation(program,'tone'),
  hue:gl.getUniformLocation(program,'hue')};
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function cpuGrade(source,width,height,look,brightness,contrast,saturation){
 const surface=document.createElement('canvas');
 surface.width=width;surface.height=height;
 const ctx=surface.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(source,0,0,width,height);
 const image=ctx.getImageData(0,0,width,height),d=image.data;
 for(let n=0;n<d.length;n+=4){
  let r=clamp(((d[n]/255-.5)*contrast+.5)*brightness,0,1);
  let g=clamp(((d[n+1]/255-.5)*contrast+.5)*brightness,0,1);
  let b=clamp(((d[n+2]/255-.5)*contrast+.5)*brightness,0,1);
  const gray=.2126*r+.7152*g+.0722*b;
  r=gray+(r-gray)*saturation;g=gray+(g-gray)*saturation;b=gray+(b-gray)*saturation;
  const sr=.393*r+.769*g+.189*b,sg=.349*r+.686*g+.168*b,sb=.272*r+.534*g+.131*b;
  r=r*(1-look.sepia)+sr*look.sepia;
  g=g*(1-look.sepia)+sg*look.sepia;
  b=b*(1-look.sepia)+sb*look.sepia;
  const yy=.299*r+.587*g+.114*b,ii=.596*r-.274*g-.322*b,qq=.211*r-.523*g+.312*b;
  const angle=look.hue*Math.PI/180,ni=ii*Math.cos(angle)-qq*Math.sin(angle),nq=ii*Math.sin(angle)+qq*Math.cos(angle);
  r=yy+.956*ni+.621*nq;g=yy-.272*ni-.647*nq;b=yy-1.106*ni+1.703*nq;
  const mono=.2126*r+.7152*g+.0722*b;
  d[n]=255*clamp(r*(1-look.grayscale)+mono*look.grayscale,0,1);
  d[n+1]=255*clamp(g*(1-look.grayscale)+mono*look.grayscale,0,1);
  d[n+2]=255*clamp(b*(1-look.grayscale)+mono*look.grayscale,0,1);
 }
 ctx.putImageData(image,0,0);return surface;
}
export function drawGradedVideo(ctx,source,x,y,width,height,look,enhancement){
 if(!enhancement&&look.brightness===1&&look.contrast===1&&look.saturate===1&&
   !look.sepia&&!look.grayscale&&!look.hue){
  ctx.drawImage(source,x,y,width,height);return;
 }
 const boost=enhancement||{};
 const brightness=clamp(look.brightness*(boost.brightness||1),.7,1.5);
 const contrast=clamp(look.contrast*(boost.contrast||1),.7,1.55);
 const saturation=clamp(look.saturate*(boost.saturate||1),0,2);
 const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
 if(renderer===undefined){try{renderer=makeRenderer()||false}catch{renderer=false}}
 if(renderer){
  const r=renderer,{gl,surface}=r;
  if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h}
  gl.viewport(0,0,w,h);
  gl.useProgram(r.program);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  try{
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
   gl.uniform3f(r.adj,brightness,contrast,saturation);
   gl.uniform3f(r.tone,look.sepia,look.grayscale,0);
   gl.uniform1f(r.hue,look.hue*Math.PI/180);
   gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   if(gl.isContextLost())throw Error('GPU context lost');
   ctx.drawImage(surface,x,y,width,height);return;
  }catch{renderer=false}
 }
 const result=cpuGrade(source,w,h,look,brightness,contrast,saturation);
 ctx.drawImage(result,x,y,width,height);
}
