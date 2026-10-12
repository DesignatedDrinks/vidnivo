/**
 * Pure conversion helpers shared by the fixed-playhead timeline and unit tests.
 * Pixel positions are measured relative to time zero at the left of the track.
 */
export function timeMsToPixels(timeMs: number, pxPerSecond: number, totalMs: number): number {
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) throw new Error('Invalid timeline scale');
  if (!Number.isFinite(timeMs)) return 0;
  const time = Math.max(0, Math.min(Math.max(0, totalMs), timeMs));
  return time / 1000 * pxPerSecond;
}
export function pixelsToTimeMs(pixels: number, pxPerSecond: number, totalMs: number): number {
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) throw new Error('Invalid timeline scale');
  if (!Number.isFinite(pixels)) return 0;
  const time = pixels / pxPerSecond * 1000;
  return Math.max(0, Math.min(Math.max(0, totalMs), time));
}
