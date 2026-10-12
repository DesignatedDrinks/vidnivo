import test from 'node:test';
import assert from 'node:assert/strict';
import {addText,createProject,validateProject} from '../src/domain/timeline.ts';
import {addCaptionCues,captionsFromProject} from '../src/domain/captions.ts';
import {replaceCaptionPhrase} from '../src/domain/captionReplace.ts';
test('bulk fixes transcript without changing title, timing or formatting',()=>{
 let p=addText(createProject(),'C++ Tutorial',0);
 p=addCaptionCues(p,[{startMs:300,endMs:2000,text:'C++ is good. C++ is fast.'},{startMs:2200,endMs:3400,text:'Learn C++ today.'}],'punch');
 const before=p.texts.map(t=>({...t}));
 const result=replaceCaptionPhrase(p,'C++','Rust');
 assert.equal(result.count,3);
 assert.equal(result.project.texts[0].text,'C++ Tutorial');
 assert.equal(result.project.texts[1].text,'Rust is good. Rust is fast.');
 assert.equal(result.project.texts[2].text,'Learn Rust today.');
 assert.equal(result.project.texts[1].startMs,before[1].startMs);
 assert.equal(result.project.texts[1].color,before[1].color);
 assert.equal(result.project.revision,p.revision+1);
 assert.equal(captionsFromProject(result.project).length,2);
 validateProject(result.project);
});
test('no matches leave project unchanged; case sensitivity configurable',()=>{
 const p=addCaptionCues(createProject(),[{startMs:0,endMs:1000,text:'Hello hello'}]);
 assert.equal(replaceCaptionPhrase(p,'missing','hello').project,p);
 const x=replaceCaptionPhrase(p,'Hello','Howdy',true);
 assert.equal(x.count,1);
 assert.equal(x.project.texts[0].text,'Howdy hello');
});
test('invalid replacement is rejected without deleting subtitle layers',()=>{
 const p=addCaptionCues(createProject(),[{startMs:0,endMs:1000,text:'hello'}]);
 assert.throws(()=>replaceCaptionPhrase(p,'','something'),/search/);
 assert.throws(()=>replaceCaptionPhrase(p,'hello',''),/empty/);
});
