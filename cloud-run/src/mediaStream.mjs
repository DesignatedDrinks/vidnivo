import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

/** Streams upload bytes with a hard cap. Never buffers original video in RAM. */
export async function writeBoundedMedia(source,destination,expectedSize,maximumSize){
 if(!Number.isSafeInteger(expectedSize)||expectedSize<=0||expectedSize>maximumSize)
  throw Object.assign(Error('Invalid declared media length.'),{status:413});
 let received=0;
 const limit=new Transform({transform(chunk,encoding,done){
  received+=chunk.length;
  if(received>expectedSize||received>maximumSize){
   done(Object.assign(Error('Media upload exceeded the declared byte length.'),{status:413}));
   return;
  }
  done(null,chunk);
 }});
 await pipeline(source,limit,destination);
 if(received!==expectedSize)
  throw Object.assign(Error('The uploaded file is incomplete.'),{status:400});
 return received;
}
