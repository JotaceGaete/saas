import { test } from 'node:test';
import assert from 'node:assert/strict';
import {newFiscalOperation,advanceFiscalOperation} from './issuance-state.mjs';
const now='2026-10-28T14:00:00Z';
const draft=()=>newFiscalOperation({businessId:'tenant1',saleId:'sale1',issuerRut:'12345678-5',now});
const move=(s,to,extra={})=>advanceFiscalOperation(s,{to,now,...extra});
test('successful issuance retains folio',()=>{
 const reserved=move(draft(),'reserved',{folio:10});
 const signed=move(reserved,'signed');
 const submitted=move(move(signed,'submitting'),'submitted',{trackId:'track1'});
 const accepted=move(submitted,'accepted');
 assert.equal(accepted.folio,10);assert.equal(accepted.version,5);
 assert.throws(()=>move(accepted,'reserved',{folio:11}));
});
test('unknown outcome does not permit a new folio',()=>{
 const unknown=move(move(move(draft(),'reserved',{folio:3}),'signed'),'submitting');
 const pending=move(unknown,'unknown');
 assert.throws(()=>move(pending,'reserved',{folio:4}));
 assert.throws(()=>move(pending,'submitted'));
 assert.equal(move(pending,'submitted',{trackId:'track1'}).folio,3);
});
test('rejects illegal transitions and folio mutation',()=>{
 assert.throws(()=>move(draft(),'accepted'));
 const reserved=move(draft(),'reserved',{folio:1});
 assert.throws(()=>move(reserved,'signed',{folio:2}));
 assert.throws(()=>move(reserved,'signed',{trackId:'x'}));
});
test('cancellation blocked after signing',()=>{
 assert.equal(move(draft(),'cancelled').state,'cancelled');
 assert.throws(()=>move(move(move(draft(),'reserved',{folio:1}),'signed'),'cancelled'));
});
test('rejects malformed identifiers and timestamps',()=>{
 assert.throws(()=>newFiscalOperation({businessId:'../x',saleId:'a',issuerRut:'12345678-5',now}));
 assert.throws(()=>move(draft(),'reserved',{folio:0}));
 assert.throws(()=>advanceFiscalOperation(draft(),{to:'reserved',folio:1,now:'2020-01-01T00:00:00Z'}));
});
