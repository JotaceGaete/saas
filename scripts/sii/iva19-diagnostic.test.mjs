import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateInclusiveIva19Diagnostic,assessSnapshotIva19Diagnostic} from './iva19-diagnostic.mjs';
test('illustrative CLP gross amounts preserve total',()=>{
 for(const gross of [1,2,3,100,119,1000,1001,10000,11900,Number.MAX_SAFE_INTEGER]){
  const r=calculateInclusiveIva19Diagnostic(gross);
  assert.equal(r.ok,true);assert.equal(r.net+r.iva,gross);
  assert.equal(r.fiscalEligible,false);assert.equal(r.siiValidated,false);
 }
 assert.deepEqual(
  (({net,iva})=>({net,iva}))(calculateInclusiveIva19Diagnostic(1190)),
  {net:1000,iva:190}
 );
});
test('rejects zero, fractional, unsafe and text amounts',()=>{
 for(const v of [0,-1,10.5,'1190',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(calculateInclusiveIva19Diagnostic(v).ok,false);
 }
});
test('snapshot VAT diagnostic never authorizes issuance',()=>{
 const prepared={ok:true,fiscalEligible:false,snapshot:{saleId:'s1',total:1190,
 lines:[{subtotal:500,taxCategory:'IVA_AFECTO_19'},{subtotal:690,taxCategory:'IVA_AFECTO_19'}]}};
 const r=assessSnapshotIva19Diagnostic(prepared);
 assert.equal(r.ok,true);assert.equal(r.net,1000);assert.equal(r.iva,190);
 assert.equal(r.calculationScope,'document');assert.equal(r.fiscalEligible,false);
 assert.equal(assessSnapshotIva19Diagnostic({...prepared,fiscalEligible:true}).ok,false);
 assert.equal(assessSnapshotIva19Diagnostic({...prepared,snapshot:{...prepared.snapshot,total:1189}}).reason,'TOTAL_MISMATCH');
 assert.equal(assessSnapshotIva19Diagnostic({...prepared,snapshot:{...prepared.snapshot,lines:[{subtotal:1190,taxCategory:'EXENTO'}]}}).reason,'INVALID_LINES');
});

test('every integer peso from 1 to 100000 conserves gross exactly',()=>{
 for(let gross=1;gross<=100000;gross++){
  const r=calculateInclusiveIva19Diagnostic(gross);
  assert.equal(r.ok,true);
  assert.equal(r.net+r.iva,gross);
  assert.equal(r.net,Math.floor((gross*100)/119+0.5));
  assert.equal(r.fiscalEligible,false);
 }
});
test('document rounding differs from summing rounded lines in edge cases',()=>{
 const perLine=[calculateInclusiveIva19Diagnostic(1),calculateInclusiveIva19Diagnostic(1)];
 const doc=calculateInclusiveIva19Diagnostic(2);
 assert.equal(perLine[0].net+perLine[1].net,2);
 assert.equal(doc.net,2);
 // Compare all small positive combinations and require an explicit witness.
 let witness=null;
 for(let a=1;a<=100&&!witness;a++) for(let b=1;b<=100;b++){
  const left=calculateInclusiveIva19Diagnostic(a);
  const right=calculateInclusiveIva19Diagnostic(b);
  const combined=calculateInclusiveIva19Diagnostic(a+b);
  if(left.net+right.net!==combined.net){witness={a,b,left,right,combined};break;}
 }
 assert.ok(witness,'expected a per-line vs document rounding difference');
 assert.equal(witness.combined.net+witness.combined.iva,witness.a+witness.b);
});
test('rejects tampered line totals and unsafe line integers',()=>{
 const base={ok:true,fiscalEligible:false,snapshot:{saleId:'s1',total:1190,
 lines:[{subtotal:1190,taxCategory:'IVA_AFECTO_19'}]}};
 for(const invalid of [1190.5,Number.MAX_SAFE_INTEGER+1,-1,'1190']){
  const p={...base,snapshot:{...base.snapshot,lines:[{subtotal:invalid,taxCategory:'IVA_AFECTO_19'}]}};
  assert.equal(assessSnapshotIva19Diagnostic(p).reason,'INVALID_LINES');
 }
});
