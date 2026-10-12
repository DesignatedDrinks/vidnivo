import { createAudioPlayer } from 'expo-audio';

/**
 * Reads real media duration instead of making an arbitrary 30-second clip.
 * The player never starts playing, and is always released.
 */
export function probeAudioDurationMs(uri: string): Promise<number> {
  if (!uri) return Promise.reject(new Error('Audio file URI is empty.'));
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer({ uri }, { updateInterval: 100 });
    let finished = false;
    let subscription: { remove(): void } | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function finish(error?: Error, seconds?: number) {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      player.remove();
      if (error) reject(error);
      else resolve(Math.round((seconds || 0) * 1000));
    }
    subscription = player.addListener('playbackStatusUpdate', status => {
      if (status.error) finish(new Error('Cannot read audio file: ' + status.error));
      else if (status.isLoaded && Number.isFinite(status.duration) && status.duration > 0)
        finish(undefined, status.duration);
    });
    timeout = setTimeout(() => finish(new Error('Audio metadata timed out after 12 seconds.')), 12000);
    if (player.isLoaded && Number.isFinite(player.duration) && player.duration > 0) finish(undefined, player.duration);
  });
}
