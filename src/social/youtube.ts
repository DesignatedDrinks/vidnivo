import {File} from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import {beginYouTubeUpload,completedYouTubeUpload,type YouTubePrivacy} from './youtubeCore';
export async function uploadVideoToYouTube(uri:string,oauthToken:string,
 title:string,description:string,privacy:YouTubePrivacy='private'):Promise<string>{
 if(!uri.startsWith('file://'))throw Error('Export the MP4 to this phone before uploading.');
 const file=new File(uri);
 if(!file.exists)throw Error('The exported video file is missing. Export again.');
 const size=file.size;
 const location=await beginYouTubeUpload(oauthToken,{title,description,privacy,size});
 const result=await LegacyFileSystem.uploadAsync(location,uri,{
  httpMethod:'PUT',uploadType:LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
  headers:{Authorization:'Bearer '+oauthToken,'Content-Type':'video/mp4','Content-Length':String(size)}
 });
 return completedYouTubeUpload(result.status,result.body);
}
