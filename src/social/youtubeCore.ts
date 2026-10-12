type Fetcher=typeof fetch;
export type YouTubePrivacy='private'|'unlisted'|'public';
export interface YouTubePost {title:string;description:string;privacy:YouTubePrivacy;size:number}
export function validateYouTubePost(post:YouTubePost):void {
 if(!post.title.trim()||post.title.length>100)throw Error('YouTube title must be 1–100 characters.');
 if(post.description.length>5000)throw Error('YouTube description is too long.');
 if(!['private','unlisted','public'].includes(post.privacy))throw Error('Invalid privacy setting.');
 if(!Number.isFinite(post.size)||post.size<=0||post.size>5*1024**3)
  throw Error('Video must be between 1 byte and 5 GB.');
}
/** Obtain a resumable upload URL. A user's OAuth token stays only in RAM. */
export async function beginYouTubeUpload(token:string, post:YouTubePost, fetcher:Fetcher=fetch):Promise<string>{
 if(!token)throw Error('Connect your YouTube account before uploading.');
 validateYouTubePost(post);
 const response=await fetcher('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8',
   'X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(post.size)},
  body:JSON.stringify({snippet:{title:post.title.trim(),description:post.description},
   status:{privacyStatus:post.privacy,selfDeclaredMadeForKids:false}})
 });
 if(!response.ok){
  if(response.status===401||response.status===403)
   throw Error('YouTube rejected authorization or upload permission. Reconnect YouTube and check API access.');
  throw Error('YouTube upload initialization failed (HTTP '+response.status+').');
 }
 const location=response.headers.get('location');
 if(!location)throw Error('YouTube did not provide an upload URL.');
 let parsed:URL;
 try{parsed=new URL(location);}catch{throw Error('YouTube returned an invalid upload URL.');}
 if(parsed.protocol!=='https:'||!['www.googleapis.com','youtube.googleapis.com'].includes(parsed.hostname)
   ||!parsed.pathname.startsWith('/upload/youtube/v3/videos'))
  throw Error('YouTube returned an unexpected upload destination.');
 return location;
}
export function completedYouTubeUpload(status:number,responseText:string):string {
 if(status<200||status>=300)
  throw Error('YouTube did not complete the upload (HTTP '+status+'). The upload might be resumable; check YouTube Studio before retrying.');
 let body:unknown;
 try{body=JSON.parse(responseText);}catch{throw Error('YouTube returned unreadable upload metadata.');}
 if(!body||typeof body!=='object'||typeof (body as {id?:unknown}).id!=='string')
  throw Error('YouTube did not confirm a video ID. Check YouTube Studio before retrying.');
 const id=(body as {id:string}).id;
 if(!/^[\w-]{6,40}$/.test(id))throw Error('YouTube returned an invalid video identifier.');
 return 'https://www.youtube.com/watch?v='+id;
}
