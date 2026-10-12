import {getApps,initializeApp,getApp,type FirebaseApp} from 'firebase/app';
import {initializeAuth,getAuth,getReactNativePersistence,type Auth} from 'firebase/auth';
import {getStorage,type FirebaseStorage} from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const config={
 apiKey:process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
 authDomain:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
 projectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
 appId:process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
 storageBucket:process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
 messagingSenderId:process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ''
};
/** Firebase client identifiers are PUBLIC, not privileged service credentials. */
export const firebaseReady=Boolean(config.apiKey && config.projectId && config.appId && config.authDomain);
export const firebaseStorageReady=firebaseReady && Boolean(config.storageBucket);
let clientApp:FirebaseApp|null=null,clientAuth:Auth|null=null,clientStorage:FirebaseStorage|null=null;

export function cloudApp():FirebaseApp {
 if(!firebaseReady)throw Error('Firebase has not been configured. Ask the project owner to add the public Firebase app settings.');
 if(!clientApp) {
  clientApp=getApps().find(app=>app.name==='vidnivo-cloud') ||
    initializeApp(config,'vidnivo-cloud');
 }
 return clientApp;
}
export function cloudAuth():Auth {
 if(clientAuth)return clientAuth;
 const app=cloudApp();
 try{
  clientAuth=initializeAuth(app,{persistence:getReactNativePersistence(AsyncStorage)});
 }catch(error){
  // Hot reload may initialize this same app's Auth instance first.
  if(typeof error==='object'&&error!==null&&'code' in error &&
    error.code==='auth/already-initialized')clientAuth=getAuth(app);
  else throw error;
 }
 return clientAuth;
}
export function cloudStorage():FirebaseStorage {
 if(!firebaseStorageReady)throw Error('Private media storage is not configured for this Firebase project.');
 if(!clientStorage)clientStorage=getStorage(cloudApp());
 return clientStorage;
}
