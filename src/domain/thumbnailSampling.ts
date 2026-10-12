/**
 * Evenly sample the visible source interval of a trimmed clip, avoiding
 * the very last source frame which some decoders cannot seek to.
 */
export function sampleThumbnailTimesMs(sourceStartMs: number, sourceEndMs: number, count: number): number[] {
  const start = Math.max(0, Number.isFinite(sourceStartMs) ? sourceStartMs : 0);
  const end = Math.max(start + 1, Number.isFinite(sourceEndMs) ? sourceEndMs : start + 1000);
  const n = Math.max(1, Math.min(10, Math.floor(Number.isFinite(count) ? count : 1)));
  return Array.from({ length: n }, (_, i) => start + (end - start) * ((i + 0.5) / n));
}
