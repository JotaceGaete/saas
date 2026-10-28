import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBoletaSetPreview} from './boleta39-set-xml-preview.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
test('five official boleta cases map to isolated non-fiscal XML previews',()=>{
 for(const c of cases){
  const r=buildBoletaSetPreview(c);
  assert.equal(r.fiscalEligible,false);
  assert.equal(r.transmittable,false);
  assert.equal(r.schemaValid,false);
  assert.ok(r.xml.includes('<CodRef>SET</CodRef>'));
  assert.ok(r.xml.includes('<RazonRef>'+c.id+'</RazonRef>'));
  assert.ok(!r.xml.includes('<DTE '));
  assert.ok(!r.xml.includes('<CAF>'));
  assert.ok(!r.xml.includes('<TED>'));
 }
});
test('case 4 maps exempt service and totals without claiming fiscal IVA rounding',()=>{
 const r=buildBoletaSetPreview(cases[3]);
 assert.match(r.xml,/<IndExe>1<\/IndExe>/);
 assert.match(r.xml,/<AfectoBruto>12720<\/AfectoBruto>/);
 assert.match(r.xml,/<Exento>2000<\/Exento>/);
 assert.match(r.xml,/<Total>14720<\/Total>/);
});
test('case 5 maps exact Kg unit',()=>{
 assert.match(buildBoletaSetPreview(cases[4]).xml,/<UnmdItem>Kg<\/UnmdItem>/);
});
test('rejects case mutation and XML injection',()=>{
 assert.throws(()=>buildBoletaSetPreview({...cases[0],expectedTotal:1}),/TOTAL_MISMATCH/);
 assert.throws(()=>buildBoletaSetPreview({...cases[0],items:[{...cases[0].items[0],name:'<DTE>'}]}),/TOTAL_MISMATCH/);
 assert.throws(()=>buildBoletaSetPreview({...cases[0],items:[{...cases[0].items[0],name:'bad\u0000'}]}),/INVALID_CERTIFICATION_CASE/);
});
