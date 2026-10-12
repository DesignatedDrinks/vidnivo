import test from 'node:test';
import assert from 'node:assert/strict';
import {SPEECH_LANGUAGES,isSpeechLanguage} from '../src/domain/speechLanguages.ts';
import {groupRecognizedWords} from '../src/domain/captions.ts';
import {generateCaptionsFromScript} from '../src/domain/captionGenerator.ts';
test('speech language registry has no duplicate language tags',()=>{
 assert.equal(new Set(SPEECH_LANGUAGES.map(x=>x.code)).size,SPEECH_LANGUAGES.length);
 assert.ok(isSpeechLanguage('en-CA'));
 assert.ok(isSpeechLanguage('fr-CA'));
 assert.equal(isSpeechLanguage('not-a-language'),false);
});
test('timed speech caption word mode preserves individual timing',()=>{
 const words=[{startMs:0,endMs:350,text:'Hello'},
 {startMs:500,endMs:850,text:'world.'}];
 const cues=groupRecognizedWords(words,1);
 assert.equal(cues.length,2);
 assert.deepEqual(cues.map(c=>c.text),['Hello','world.']);
 assert.equal(cues[0].endMs,350);
});
test('script one-word display mode remains sequential',()=>{
 const cues=generateCaptionsFromScript('You can do this',0,3000,1);
 assert.equal(cues.length,4);
 assert.equal(cues.at(-1).endMs,3000);
 assert.ok(cues.every((c,i)=>i===0||c.startMs===cues[i-1].endMs));
});
