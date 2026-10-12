/** Post-render file validation, not a substitute for decoding and watching MP4. */
export function assertExportFileMetadata(uri:unknown,exists:unknown,size:unknown):void {
 if(typeof uri!=='string' || !uri.startsWith('file://'))
  throw Error('The video exporter did not return a local file URL.');
 if(exists!==true)throw Error('The exported MP4 file does not exist on this device.');
 if(typeof size!=='number' || !Number.isFinite(size) || size<1024)
  throw Error('The exported MP4 appears empty or incomplete. Export again before sharing.');
}
