// Account-portable project metadata. No device file:// URI is accepted here.
// Each remote URI is an opaque owner-scoped media ID resolved on restore.
const ID=/^[A-Za-z0-9_-]{8,80}$/;
const MAX_PROJECT_BYTES=512*1024;
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
export function cloudMediaUri(id){return 'cloud://'+id;}
export function validateCloudProject(raw,id){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  raw.id!==id||!ID.test(id)||typeof raw.name!=='string'||
  !raw.name.trim()||raw.name.length>180||
  !['9:16','16:9','1:1'].includes(raw.aspectRatio)||
  !Number.isSafeInteger(raw.revision)||raw.revision<1||
  !Array.isArray(raw.assets)||!Array.isArray(raw.clips)||!Array.isArray(raw.texts)||
  raw.assets.length>200||raw.clips.length>1000||raw.texts.length>2000||
  typeof raw.createdAt!=='string'||typeof raw.updatedAt!=='string'||
  !Number.isFinite(Date.parse(raw.createdAt))||!Number.isFinite(Date.parse(raw.updatedAt)))
  throw Object.assign(Error('Invalid portable project.'),{status:400});
 if(Buffer.byteLength(JSON.stringify(raw))>MAX_PROJECT_BYTES)
  throw Object.assign(Error('Project metadata exceeds 512 KB.'),{status:413});
 const assetIds=new Set(),clipIds=new Set(),textIds=new Set();
 for(const asset of raw.assets){
  if(!asset||!ID.test(asset.id||'')||assetIds.has(asset.id)||
   !['video','image','audio'].includes(asset.kind)||
   asset.uri!==cloudMediaUri(asset.id)||
   typeof asset.filename!=='string'||asset.filename.length>180||
   !number(asset.durationMs,1,15*60*60*1000)||
   !number(asset.width,0,16384)||!number(asset.height,0,16384))
    throw Object.assign(Error('Project includes invalid remote media.'),{status:400});
  assetIds.add(asset.id);
 }
 for(const clip of raw.clips){
  if(!clip||!ID.test(clip.id||'')||clipIds.has(clip.id)||
   !assetIds.has(clip.assetId)||!['audio','video'].includes(clip.track)||
   !number(clip.startMs,0,24*60*60*1000)||
   !number(clip.inMs,0,24*60*60*1000)||
   !number(clip.outMs,0,24*60*60*1000)||clip.outMs<=clip.inMs||
   !number(clip.speed,.25,4)||!number(clip.volume,0,1)||
   typeof clip.muted!=='boolean')
    throw Object.assign(Error('Project includes invalid clips.'),{status:400});
  const asset=raw.assets.find(a=>a.id===clip.assetId);
  if(clip.outMs>asset.durationMs+50||
   (clip.track==='audio')!==(asset.kind==='audio'))
    throw Object.assign(Error('Clip track does not match its cloud source.'),{status:400});
  clipIds.add(clip.id);
 }
 for(const t of raw.texts){
  if(!t||!ID.test(t.id||'')||textIds.has(t.id)||
   typeof t.text!=='string'||!t.text.trim()||t.text.length>3000||
   !number(t.startMs,0,24*60*60*1000)||
   !number(t.endMs,0,24*60*60*1000)||t.endMs<=t.startMs||
   !number(t.x,0,1)||!number(t.y,0,1)||
   !number(t.fontSize,1,200)||!/^#[A-Fa-f0-9]{6}$/.test(t.color||'')||
   (t.role!==undefined&&!['caption','title'].includes(t.role)))
    throw Object.assign(Error('Project includes invalid captions.'),{status:400});
  textIds.add(t.id);
 }
 if(raw.look&&(
  !['none','warm','cool','cinematic','vintage','bright','noir'].includes(raw.look.preset)||
  !number(raw.look.intensity,0,100)))
  // Actual project look parsing is checked again in the mobile domain layer.
  throw Object.assign(Error('Invalid project colour look.'),{status:400});
 const clean={id:raw.id,name:raw.name,aspectRatio:raw.aspectRatio,
  createdAt:raw.createdAt,updatedAt:raw.updatedAt,revision:raw.revision,
  assets:raw.assets.map(({id,kind,uri,filename,durationMs,width,height})=>
   ({id,kind,uri,filename,durationMs,width,height})),
  clips:raw.clips.map(({id,assetId,track,startMs,inMs,outMs,speed,volume,muted})=>
   ({id,assetId,track,startMs,inMs,outMs,speed,volume,muted})),
  texts:raw.texts.map(({id,role,text,startMs,endMs,x,y,fontSize,color})=>
   ({id,...(role?{role}:{}),text,startMs,endMs,x,y,fontSize,color}))};
 if(raw.look)clean.look=raw.look;
 return clean;
}
