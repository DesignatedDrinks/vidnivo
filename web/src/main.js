import {initializeApp} from 'firebase/app';
import {
 getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,
 getRedirectResult,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut
} from 'firebase/auth';
import {getStorage,ref,uploadBytesResumable,deleteObject,getBlob} from 'firebase/storage';
import './style.css';

const config={
 apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
 authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
 projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
 storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
 appId:import.meta.env.VITE_FIREBASE_APP_ID
};
const configured=Object.values(config).every(v=>typeof v==='string'&&v.trim());
const root=document.querySelector('#app');
root.innerHTML=`
<header><a href="/" aria-label="VIDNIVO home" class="logo">VIDNI<b>VO</b></a>
 <span class="tag">PRIVATE DEVELOPMENT PREVIEW</span></header>
<main>
 <section class="hero">
  <div class="eyebrow">Create with clarity</div>
  <h1>Your story. <span>Your edit.</span></h1>
  <p class="lead">VIDNIVO is building a mobile-first video studio for purposeful edits, accurate captions, and creator-controlled publishing. The mobile editor is in active development; this site is a secure account and cloud-media foundation, not a finished browser editor.</p>
  <div class="actions"><a class="btn" href="#account">Open your cloud dashboard</a>
   <a class="btn secondary" href="#about">Explore the vision</a></div>
 </section>
 <section id="about" aria-label="Product capabilities">
  <h2 class="section-heading">One connected creative workflow</h2>
  <div class="cards">
   <div class="card"><h3>Review before cutting</h3><p>Make informed edits. Keep important reactions and original footage in your control.</p></div>
   <div class="card"><h3>Thoughtful captions</h3><p>Generate, correct, and style captions before committing them to an exported video.</p></div>
   <div class="card"><h3>Own your work</h3><p>Private per-account cloud media storage designed to complement the mobile editing workflow.</p></div>
  </div>
 </section>
 <section id="account" class="dashboard" aria-label="VIDNIVO account">
  <div class="eyebrow">Account dashboard</div>
  <h2 class="section-heading">Your VIDNIVO workspace</h2>
  <p class="muted">Firebase Authentication identifies your account. Uploaded files are private to that user. Cloud media and the API require a configured paid-plan Firebase project even when usage is within no-cost quotas.</p>
  <div id="configuration" class="message warning" hidden role="status"></div>
  <div id="signed-out">
   <div class="actions"><button id="google-login" class="btn" type="button">Sign in with Google</button></div>
   <form id="email-form">
    <label for="email">Email</label><input id="email" type="email" autocomplete="email" required maxlength="254">
    <label for="password">Password (at least 6 characters)</label><input id="password" type="password" autocomplete="current-password" minlength="6" required>
    <div class="actions">
     <button type="submit" class="btn">Sign in</button>
     <button type="button" id="create-account" class="btn secondary">Create account</button>
    </div>
   </form>
  </div>
  <div id="signed-in" hidden>
   <div class="row">
    <strong id="account-email"></strong>
    <button id="sign-out" class="btn secondary" type="button">Sign out</button>
   </div>
   <p class="muted">Only the account signed in can view and upload its own files. Project timelines remain in the current VIDNIVO local/Google Sheets workflow.</p>
   <div class="panel">
    <h3>Private media library</h3>
    <label for="media-file">Video, audio or photo (maximum 200 MB per upload)</label>
    <input id="media-file" type="file" accept="video/*,audio/*,image/*">
    <div class="actions"><button id="upload-media" class="btn" type="button">Upload private media</button>
     <button id="refresh-media" class="btn secondary" type="button">Refresh library</button></div>
    <div class="meter" aria-label="Upload progress"><span id="upload-progress"></span></div>
    <ul id="media-list" class="file-list"><li>Load your files after signing in.</li></ul>
    <button id="load-more-media" class="btn secondary" type="button" hidden>Load more media</button>
   </div>
   <div class="panel"><strong>Backend status</strong> <span id="backend-status" class="muted">Checking…</span></div>
  </div>
  <div id="message" role="status" aria-live="polite" class="message" hidden></div>
 </section>
</main>
<footer>© VIDNIVO · In development · No public subscription or production hosting claimed. Third-party services may incur charges.</footer>
`;
const el=id=>document.getElementById(id);
let app,auth,storage,currentUser=null;
let pendingUpload=false;
let mediaCursor=null;
let libraryRequest=0;
const apiBase=(import.meta.env.VITE_API_BASE_URL||'').trim().replace(/\/$/,'');
const pathFor=path=>apiBase+path;
function message(value,isWarning=false) {
 const node=el('message');
 node.hidden=!value;node.textContent=value||'';
 node.classList.toggle('warning',isWarning);
}
function validateMedia(file) {
 if(!file)throw Error('Choose a media file first.');
 if(file.size<1||file.size>200*1024*1024)throw Error('Choose a file smaller than 200 MB.');
 if(!/^(video|audio|image)\/[a-z0-9.+-]+$/i.test(file.type))throw Error('Only video, audio, and image files are supported.');
}
async function callApi(path,options={}) {
 if(!currentUser)throw Error('Sign in before accessing private media.');
 const token=await currentUser.getIdToken();
 const headers={Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})};
 const reply=await fetch(pathFor(path),{...options,headers:{...headers,...options.headers}});
 let body;
 try {body=await reply.json();}catch {
  throw Error('The cloud API is not available. Check Cloud Run and Firebase Hosting deployment.');
 }
 if(!reply.ok)throw Error(body?.error||('Cloud API error '+reply.status));
 return body;
}
function ownedMediaPath(file,uid){
 return typeof file?.assetId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(file.assetId)&&
  typeof file?.objectPath==='string'&&
  file.objectPath.startsWith('users/'+uid+'/media/'+file.assetId+'/')&&
  /^users\/[A-Za-z0-9_-]{1,128}\/media\/[A-Za-z0-9_-]{8,80}\/[A-Za-z0-9_.-]{1,120}$/.test(file.objectPath);
}
async function downloadCloudFile(file,button){
 const uid=currentUser?.uid;
 if(!uid||!ownedMediaPath(file,uid)){
  message('This file has an invalid account storage path. Refresh the media list.',true);return;
 }
 button.disabled=true;
 try{
  // Firebase Storage checks the signed-in user's security rules. Unlike
  // tokenized public URLs, an authenticated blob does not expose a share link.
  const blob=await getBlob(ref(storage,file.objectPath),200*1024*1024);
  if(currentUser?.uid!==uid)return;
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=file.name||'vidnivo-media';
  document.body.append(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  message('Your file download has started.');
 }catch(e){
  if(currentUser?.uid===uid)
   message('Download failed. Check Storage permissions and browser CORS settings: '+e.message,true);
 }finally{button.disabled=false;}
}
async function refreshFiles(append=false) {
 const uid=currentUser?.uid;
 if(!uid||(append&&!mediaCursor))return;
 const requestId=++libraryRequest;
 const list=el('media-list'),more=el('load-more-media');
 const cursor=append?mediaCursor:null;
 more.disabled=true;
 if(!append){list.replaceChildren();mediaCursor=null;more.hidden=true;}
 try {
  const query=cursor?'?after='+encodeURIComponent(cursor):'';
  const data=await callApi('/api/v1/media'+query);
  if(libraryRequest!==requestId||currentUser?.uid!==uid)return;
  if(!Array.isArray(data.media))throw Error('Unexpected media list response.');
  if(!append&&!data.media.length){
   const item=document.createElement('li');
   item.textContent='No cloud media uploaded yet.';list.append(item);
  }
  for(const file of data.media){
   const li=document.createElement('li');li.className='file-entry';
   const info=document.createElement('div');info.className='file-details';
   const name=document.createElement('strong');name.textContent=file.name||'Media asset';
   const details=document.createElement('span');
   details.textContent=((file.size||0)/(1024*1024)).toFixed(1)+' MB';
   info.append(name,details);
   const actions=document.createElement('div');actions.className='file-actions';
   const download=document.createElement('button');
   download.type='button';download.className='btn secondary small';
   download.textContent='Download';
   download.disabled=!ownedMediaPath(file,uid);
   download.addEventListener('click',()=>void downloadCloudFile(file,download));
   const remove=document.createElement('button');
   remove.type='button';remove.className='btn secondary small danger';
   remove.textContent='Delete';
   remove.addEventListener('click',async()=>{
    if(currentUser?.uid!==uid||!window.confirm(
     'Permanently delete "'+(file.name||'this media file')+'"? This cannot be undone.'))return;
    if(currentUser?.uid!==uid)return;
    remove.disabled=true;
    try{
     await callApi('/api/v1/media/'+encodeURIComponent(file.assetId),{method:'DELETE'});
     if(currentUser?.uid===uid){li.remove();message('Cloud media permanently deleted.');}
    }catch(e){if(currentUser?.uid===uid)message('Delete failed: '+e.message,true);}
    finally{remove.disabled=false;}
   });
   actions.append(download,remove);li.append(info,actions);list.append(li);
  }
  mediaCursor=data.nextCursor||null;
  more.hidden=!mediaCursor;
 }catch(e){
  if(libraryRequest!==requestId||currentUser?.uid!==uid)return;
  if(append)message('Could not load more media: '+e.message,true);
  else {const item=document.createElement('li');item.textContent=e.message;list.append(item);}
 }finally{if(libraryRequest===requestId)more.disabled=false;}
}
async function checkApi() {
 try {
  const response=await fetch(pathFor('/api/healthz'));
  const body=await response.json();
  if(response.ok&&body.status==='ok')el('backend-status').textContent='Cloud Run API responding';
  else throw Error('API offline');
 }catch {el('backend-status').textContent='Not deployed or not reachable. Media registration is unavailable.';}
}
function uploadFile(file) {
 if(!currentUser||pendingUpload)return;
 try {validateMedia(file);}catch(e){message(e.message,true);return;}
 pendingUpload=true;el('upload-media').disabled=true;
 const assetId=crypto.randomUUID().replaceAll('-','');
 const fileName=file.name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(-120)||'media.bin';
 const objectPath='users/'+currentUser.uid+'/media/'+assetId+'/'+fileName;
 const fileRef=ref(storage,objectPath);
 const task=uploadBytesResumable(fileRef,file,{contentType:file.type});
 task.on('state_changed',
  snapshot=>{
   const percent=snapshot.totalBytes?100*snapshot.bytesTransferred/snapshot.totalBytes:0;
   el('upload-progress').style.width=percent.toFixed(1)+'%';
  },
  error=>{
   pendingUpload=false;el('upload-media').disabled=false;
   message('Upload failed: '+error.message,true);
  },
  async()=>{
   try {
    await callApi('/api/v1/media/register',{method:'POST',
     body:JSON.stringify({assetId,objectPath,name:file.name})});
    message('Private upload saved. Only your signed-in account may access it.');
    await refreshFiles();
   }catch(e){
    try {await deleteObject(fileRef);}catch {/* Preserve failed orphan for manual cleanup */ }
    message('Upload was not registered and automatic cleanup was attempted: '+e.message,true);
   }finally{
    pendingUpload=false;el('upload-media').disabled=false;
    el('upload-progress').style.width='0%';
   }
  }
 );
}
if(!configured) {
 el('signed-out').hidden=true;
 el('configuration').hidden=false;
 el('configuration').textContent='Firebase is not configured. Add the public web app settings to the deployment environment, then build and deploy this site. No user files can be uploaded yet.';
} else {
 app=initializeApp(config);
 auth=getAuth(app);
 storage=getStorage(app);
 const provider=new GoogleAuthProvider();
 getRedirectResult(auth).catch(e=>message('Sign-in redirect failed: '+e.message,true));
 onAuthStateChanged(auth,user=>{
  libraryRequest++;
  mediaCursor=null;
  el('load-more-media').hidden=true;
  currentUser=user;
  el('signed-out').hidden=Boolean(user);
  el('signed-in').hidden=!user;
  if(user) {
   el('account-email').textContent=user.email||'Signed-in Firebase account';
   void checkApi();
   void refreshFiles();
  } else {el('media-list').replaceChildren();el('backend-status').textContent='Sign in to check access.';}
 });
 el('google-login').addEventListener('click',async()=>{
  try {
   await signInWithPopup(auth,provider);
  }catch(e) {
   if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code)) {
    try {await signInWithRedirect(auth,provider);}catch(ex){message(ex.message,true);}
   } else message('Google sign-in failed: '+e.message,true);
  }
 });
 el('email-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{await signInWithEmailAndPassword(auth,el('email').value,el('password').value);message('Signed in.');}
  catch(e){message('Could not sign in: '+e.message,true);}
 });
 el('create-account').addEventListener('click',async()=>{
  try{await createUserWithEmailAndPassword(auth,el('email').value,el('password').value);message('Account created.');}
  catch(e){message('Could not create account: '+e.message,true);}
 });
 el('sign-out').addEventListener('click',async()=>{try{await signOut(auth);message('Signed out.');}catch(e){message(e.message,true);}});
 el('upload-media').addEventListener('click',()=>{
  const file=el('media-file').files?.[0];uploadFile(file);
 });
 el('refresh-media').addEventListener('click',()=>void refreshFiles());
 el('load-more-media').addEventListener('click',()=>void refreshFiles(true));
}
