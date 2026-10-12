import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,setProjectLook} from '../src/domain/timeline.ts';
import {createExportPlan} from '../src/export/plan.ts';
import {LOOK_ORDER,lookOverlay,parseLook,resolveLook} from '../src/domain/looks.ts';
test('neutral and styled looks have predictable preview-export values',()=>{
 assert.equal(LOOK_ORDER.length,8);
 assert.equal(lookOverlay().alpha,0);
 assert.deepEqual(lookOverlay({preset:'sunset',intensity:50}),{color:'#E97D42',alpha:.11});
 assert.deepEqual(parseLook(JSON.stringify({preset:'rose',intensity:65})),{preset:'rose',intensity:65});
});
test('project selection preserves undo revision and remains roundtrippable',()=>{
 const p=createProject();
 const edited=setProjectLook(p,'cinema',75);
 assert.equal(edited.revision,p.revision+1);
 assert.deepEqual(edited.look,{preset:'cinema',intensity:75});
 assert.equal(setProjectLook(edited,'cinema',75),edited);
});
test('bad filters cannot produce malformed export settings',()=>{
 assert.throws(()=>resolveLook({preset:'bad',intensity:100}),/Unknown/);
 assert.throws(()=>resolveLook({preset:'warm',intensity:NaN}),/intensity/);
 assert.throws(()=>resolveLook({preset:'warm',intensity:120}),/intensity/);
 assert.equal(parseLook('invalid').preset,'none');
});
