import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const set=JSON.parse(readFileSync(new URL('./fixtures/artema-set-5157271.json',import.meta.url),'utf8'));
const cases=set.cases;
test('official set transcription includes 4 invoices, 3 credit notes and 1 debit note',()=>{
 assert.equal(set.set,'5157271');
 assert.equal(set.fiscalEligible,false);
 assert.deepEqual(cases.map(x=>x.type),[33,33,33,33,61,61,61,56]);
 assert.equal(new Set(cases.map(x=>x.id)).size,8);
});
test('invoice cases preserve affected and exempt lines and item/global discounts',()=>{
 assert.deepEqual(cases[0].items.map(x=>x.quantity),[139,59]);
 assert.deepEqual(cases[1].items.map(x=>x.discountPercent),[6,11]);
 assert.equal(cases[2].items[2].tax,'exento');
 assert.equal(cases[2].items[2].unitPrice,34910);
 assert.equal(cases[3].globalDiscount.percent,12);
 assert.equal(cases[3].globalDiscount.tax,'afecto');
});
test('credit and debit notes refer to existing prior cases',()=>{
 const ids=new Set();
 for(const item of cases){
  if(item.reference) assert.ok(ids.has(item.reference),item.id+' must refer to earlier case');
  ids.add(item.id);
 }
 assert.equal(cases[5].items[0].quantity,153);
 assert.equal(cases[5].items[1].quantity,238);
 assert.equal(cases[7].reference,'5157271-5');
});
test('fixture contains no taxpayer secrets, folios or authorized issuance markers',()=>{
 const raw=JSON.stringify(set);
 for(const key of ['privateKey','cafXml','certificatePassword','folio','signature','ted'])
  assert.equal(Object.hasOwn(set,key),false,key);
 assert.equal(raw.includes('fiscalEligible":true'),false);
});
