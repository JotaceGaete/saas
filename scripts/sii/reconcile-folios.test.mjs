import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileFolios} from './reconcile-folios.mjs';
test('summarizes issued and voided folios without fiscal authorization',()=>{
 const result=reconcileFolios([{folio:1,status:'issued',amount:1200},{folio:2,status:'voided'},{folio:4,status:'issued',amount:500}]);
 assert.deepEqual(result,{issued:2,voided:1,total:1700,used:3,transmittable:false});
 assert.ok(Object.isFrozen(result));
});
test('rejects duplicates',()=>assert.throws(()=>reconcileFolios([{folio:1,status:'voided'},{folio:1,status:'voided'}]),/INVALID_FOLIO/));
test('rejects amounts on voided folios',()=>assert.throws(()=>reconcileFolios([{folio:2,status:'voided',amount:0}]),/VOIDED_WITH_AMOUNT/));
test('rejects malformed and negative amounts',()=>assert.throws(()=>reconcileFolios([{folio:3,status:'issued',amount:-1}]),/INVALID_AMOUNT/));
test('rejects unknown states',()=>assert.throws(()=>reconcileFolios([{folio:3,status:'credited',amount:100}]),/INVALID_STATUS/));
