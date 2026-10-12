// Pure, testable guard for browser operations on private storage references.
// Object paths are not credentials: Firebase Auth + Storage Rules enforce access.
export function ownedMediaPath(file,uid){
 return typeof uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(uid)&&
  typeof file?.assetId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(file.assetId)&&
  typeof file?.objectPath==='string'&&
  file.objectPath.startsWith('users/'+uid+'/media/'+file.assetId+'/')&&
  /^users\/[A-Za-z0-9_-]{1,128}\/media\/[A-Za-z0-9_-]{8,80}\/[A-Za-z0-9_.-]{1,120}$/.test(file.objectPath);
}
