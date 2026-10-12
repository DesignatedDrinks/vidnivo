import * as SecureStore from 'expo-secure-store';
const API_KEY_ID='vidnivo.openai.key.v1';
export async function loadOpenAIKey():Promise<string|null>{
 return SecureStore.getItemAsync(API_KEY_ID);
}
export async function saveOpenAIKey(key:string):Promise<void>{
 const trimmed=key.trim();
 if(!trimmed.startsWith('sk-')||trimmed.length<16)
  throw Error('OpenAI API keys normally begin with sk-. Check your key.');
 await SecureStore.setItemAsync(API_KEY_ID,trimmed,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export async function removeOpenAIKey():Promise<void>{
 await SecureStore.deleteItemAsync(API_KEY_ID);
}
