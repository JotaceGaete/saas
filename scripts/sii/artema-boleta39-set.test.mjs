import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8'));
test('official boleta set has five distinct cases and no fiscal authorization',()=>{
 assert.equal(fixture.documentType,39);
 assert.equal(fixture.fiscalEligible,false);
 assert.equal(fixture.certificationOnly,true);
 assert.deepEqual(fixture.cases.map(c=>c.id),['CASO-1','CASO-2','CASO-3','CASO-4','CASO-5']);
});
test('inclusive-price totals and reference metadata are preserved',()=>{
 for(const c of fixture.cases){
  assert.equal(c.items.reduce((sum,i)=>sum+i.quantity*i.unitPriceWithIva,0),c.expectedTotal);
  assert.equal(fixture.reference.CodRef,'SET');
  assert.match(c.id,/^CASO-[1-5]$/);
 }
 assert.deepEqual(fixture.cases.map(c=>c.expectedTotal),[29800,2040,4100,14720,3500]);
});
test('exempt service and Kg unit are retained exactly',()=>{
 assert.equal(fixture.cases[3].items[0].tax,'afecto');
 assert.equal(fixture.cases[3].items[1].tax,'exento');
 assert.equal(fixture.cases[3].items[1].kind,'servicio');
 assert.equal(fixture.cases[4].items[0].unit,'Kg');
 assert.equal(fixture.cases[2].items[0].name,'Sandwic');
});
