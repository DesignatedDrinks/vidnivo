/** Creative colour looks: reproducible translucent tint, not synthetic AI filters. */
export type LookPreset='none'|'warm'|'cool'|'cinema'|'sunset'|'vintage'|'rose'|'night';
export interface LookSetting {preset:LookPreset;intensity:number}
export interface LookDefinition {label:string;color:string;strength:number}
export const LOOKS:Record<LookPreset,LookDefinition>={
 none:{label:'Original',color:'#FFFFFF',strength:0},
 warm:{label:'Golden',color:'#FFBA74',strength:.16},
 cool:{label:'Blue Hour',color:'#4C9CE5',strength:.16},
 cinema:{label:'Cinema',color:'#375E66',strength:.20},
 sunset:{label:'Sunset',color:'#E97D42',strength:.22},
 vintage:{label:'Vintage',color:'#C3AD77',strength:.21},
 rose:{label:'Rose',color:'#DB789C',strength:.19},
 night:{label:'Midnight',color:'#364D7B',strength:.22}
};
export const LOOK_ORDER:LookPreset[]=['none','warm','cool','cinema','sunset','vintage','rose','night'];
export function resolveLook(raw?:Partial<LookSetting>|null):LookSetting {
 const preset=raw?.preset??'none';
 if(!Object.prototype.hasOwnProperty.call(LOOKS,preset))throw Error('Unknown colour look.');
 const intensity=raw?.intensity??100;
 if(typeof intensity!=='number'||!Number.isFinite(intensity)||intensity<0||intensity>100)
  throw Error('Look intensity must be between 0 and 100.');
 return {preset,intensity:Math.round(intensity)};
}
export function parseLook(raw?:string):LookSetting {
 if(!raw)return {preset:'none',intensity:100};
 try{return resolveLook(JSON.parse(raw));}
 catch{return {preset:'none',intensity:100};}
}
export function lookOverlay(raw?:Partial<LookSetting>|null):{color:string;alpha:number} {
 const look=resolveLook(raw);
 const definition=LOOKS[look.preset];
 return {color:definition.color,alpha:+(definition.strength*look.intensity/100).toFixed(5)};
}
