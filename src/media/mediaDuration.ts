/**
 * ImagePickerAsset.duration is measured in seconds, while ROLLBLINK's
 * timeline stores integer milliseconds. Fail clearly instead of creating
 * incorrect 0.5-second timelines when metadata is unavailable.
 */
export function pickedMediaDurationMs(kind:'video'|'image', pickerDurationSeconds?:number|null):number {
  if(kind==='image')return 5000;
  const seconds=pickerDurationSeconds;
  if(typeof seconds!=='number' || !Number.isFinite(seconds) || seconds<=0)
    throw Error('This video does not report a valid duration. Try exporting it to your camera roll and importing again.');
  const ms=Math.round(seconds*1000);
  if(ms<250)throw Error('Video is too short; minimum supported duration is 0.25 seconds.');
  if(ms>2*60*60*1000)throw Error('Videos longer than two hours are not supported.');
  return ms;
}
