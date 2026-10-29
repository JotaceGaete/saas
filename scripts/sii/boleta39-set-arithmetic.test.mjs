import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectBoletaSetCase} from './boleta39-set-arithmetic.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
test('all five official boleta cases preserve gross totals and remain non-fiscal',()=>{
 const results=cases.map(inspectBoletaSetCase);
 assert.deepEqual(results.map(x=>x.gross),[29800,2040,4100,14720,3500]);
 for(const r of results){
  assert.equal(r.matchesFixture,true);
  assert.equal(r.indicativeTotal,r.gross);
  assert.equal(r.fiscalEligible,false);
  assert.equal(r.roundingApproved,false);
  assert.equal(r.transmittable,false);
 }
});
test('case 4 separates exempt 2000 from affected 12720',()=>{
 const r=inspectBoletaSetCase(cases[3]);
 assert.equal(r.exemptGross,2000);
 assert.equal(r.affectedGross,12720);
 assert.equal(r.indicativeNet+r.indicativeIva,12720);
});
test('case 5 preserves Kg unit and inclusive unit price',()=>{
 const r=inspectBoletaSetCase(cases[4]);
 assert.equal(r.lines[0].unit,'Kg');
 assert.equal(r.lines[0].unitPriceWithIva,700);
});
test('rejects unsafe or invalid inputs without producing a fiscal total',()=>{
 for(const invalid of [{...cases[0],items:[{quantity:0,unitPriceWithIva:1,tax:'afecto'}]},
  {...cases[0],items:[{quantity:2,unitPriceWithIva:Number.MAX_SAFE_INTEGER,tax:'afecto'}]},
  {...cases[0],items:[{quantity:1,unitPriceWithIva:1,tax:'desconocido'}]}])
  assert.throws(()=>inspectBoletaSetCase(invalid));
});
