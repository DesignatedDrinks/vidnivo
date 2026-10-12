import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { RecognizedWord } from '../domain/captions';

interface SpeechModule {
  transcribeFile(uri: string, language: string): Promise<RecognizedWord[]>;
}
export function speechRecognitionAvailable(): boolean {
  return Platform.OS === 'ios' && Boolean(requireOptionalNativeModule<SpeechModule>('VidnivoSpeech'));
}
export async function transcribeLocalVideo(uri: string, language = 'en-US'): Promise<RecognizedWord[]> {
  const native = Platform.OS === 'ios' ?
    requireOptionalNativeModule<SpeechModule>('VidnivoSpeech') : null;
  if (!native) throw new Error('Automatic captions currently require a VIDNIVO iPhone development build. You can import .srt or .vtt captions on any device.');
  if (!uri.startsWith('file://')) throw new Error('Select a locally stored video.');
  const words = await native.transcribeFile(uri, language);
  if (!Array.isArray(words)) throw new Error('Speech service returned invalid results.');
  return words;
}
