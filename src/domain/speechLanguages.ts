/** SpeechRecognizer availability varies by phone and installed language pack. */
export const SPEECH_LANGUAGES=[
 {code:'en-US',label:'English (US)',short:'EN-US'},
 {code:'en-CA',label:'English (Canada)',short:'EN-CA'},
 {code:'fr-CA',label:'French (Canada)',short:'FR-CA'},
 {code:'es-ES',label:'Spanish',short:'ES'},
 {code:'de-DE',label:'German',short:'DE'},
 {code:'it-IT',label:'Italian',short:'IT'},
 {code:'pt-BR',label:'Portuguese (Brazil)',short:'PT'},
 {code:'ja-JP',label:'Japanese',short:'JA'}
] as const;
export type SpeechLanguage=typeof SPEECH_LANGUAGES[number]['code'];
export function isSpeechLanguage(language:string): language is SpeechLanguage {
 return SPEECH_LANGUAGES.some(x=>x.code===language);
}
