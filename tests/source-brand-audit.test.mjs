import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

const forbidden=String.fromCharCode(99,97,112,99,117,116);
const ignored=new Set(['.git','.expo','node_modules','dist','dist-android','dist-ios','android','ios','build','coverage']);
const paths=[];
function scan(directory='.') {
 for(const item of readdirSync(directory)){
  if(ignored.has(item))continue;
  const full=join(directory,item);
  if(statSync(full).isDirectory())scan(full);
  else if(/\.(md|ts|tsx|mjs|json|yml|yaml|swift|kt|gradle|podspec)$/.test(item))
    paths.push(full);
 }
}
test('independent product identity in all checked-in source and docs',()=>{
 scan();
 assert.ok(paths.length>15);
 const hits=paths.filter(file=>readFileSync(file,'utf8').toLowerCase().includes(forbidden));
 assert.deepEqual(hits,[], 'A disallowed legacy product name remains in source or documentation.');
});
