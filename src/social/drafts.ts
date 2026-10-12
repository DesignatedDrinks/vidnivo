import AsyncStorage from '@react-native-async-storage/async-storage';
import {parseSocialPostDraft,type SocialPostDraft} from './copy';
const KEY='@rollblink/social/draft/v1/';
export interface StoredSocialDraft {projectId:string;revision:number;generatedAt:string;draft:SocialPostDraft}
export async function saveSocialDraft(projectId:string,revision:number,draft:SocialPostDraft):Promise<void>{
 if(!projectId||!Number.isInteger(revision))throw Error('Invalid project reference');
 const record:StoredSocialDraft={projectId,revision,generatedAt:new Date().toISOString(),
  draft:parseSocialPostDraft(draft)};
 await AsyncStorage.setItem(KEY+projectId,JSON.stringify(record));
}
export async function loadSocialDraft(projectId:string):Promise<StoredSocialDraft|null>{
 const json=await AsyncStorage.getItem(KEY+projectId);
 if(!json)return null;
 const record=JSON.parse(json) as StoredSocialDraft;
 if(record.projectId!==projectId||!Number.isInteger(record.revision))
  throw Error('Saved social draft is invalid.');
 return {...record,draft:parseSocialPostDraft(record.draft)};
}
