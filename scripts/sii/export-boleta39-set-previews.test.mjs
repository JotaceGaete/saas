import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareBoletaSetArtifacts} from './export-boleta39-set-previews.mjs';
test('exports five deterministic, distinct and non-fiscal XML previews',()=>{
 const first=prepareBoletaSetArtifacts();
 const second=prepareBoletaSetArtifacts();
 assert.deepEqual(first,second);
 assert.deepEqual(first.map(x=>x.filename),['CASO-1.preview.xml','CASO-2.preview.xml','CASO-3.preview.xml','CASO-4.preview.xml','CASO-5.preview.xml']);
 for(const a of first){
  assert.equal(a.sha256,createHash('sha256').update(a.xml).digest('hex'));
  assert.match(a.xml,/WalinkaCertificationPreview/);
  assert.doesNotMatch(a.xml,/<(?:DTE|TED|CAF|Signature)(?:\s|>)/);
  assert.match(a.xml,new RegExp('<RazonRef>'+a.caseId+'</RazonRef>'));
 }
});
