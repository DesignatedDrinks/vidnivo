import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExportFileMetadata} from '../src/export/fileCheck.ts';
test('accepts a local MP4 file with nonzero bytes',()=>{
 assert.doesNotThrow(()=>assertExportFileMetadata('file:///tmp/export.mp4',true,182000));
});
test('does not claim success on a missing or empty rendered file',()=>{
 assert.throws(()=>assertExportFileMetadata('https://malicious.test/export.mp4',true,182000),/local file/);
 assert.throws(()=>assertExportFileMetadata('file:///tmp/export.mp4',false,182000),/does not exist/);
 assert.throws(()=>assertExportFileMetadata('file:///tmp/export.mp4',true,0),/empty or incomplete/);
 assert.throws(()=>assertExportFileMetadata('file:///tmp/export.mp4',true,NaN),/empty or incomplete/);
});
