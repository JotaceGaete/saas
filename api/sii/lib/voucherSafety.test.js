import {it,expect} from 'vitest';
import {previewPaidPosDte39} from './previewPaidPosDte39.js';
for(const method of ['mercado_pago','debit_card','credit_card','card']){
 it('blocks unclassified voucher: '+method,()=>{
  const data={job:{document_type:39,invoice_id:'i',business_id:'b',operation_id:'op'},invoice:{id:'i',business_id:'b',total:1000},payments:[{payment_method:method}]};
  expect(()=>previewPaidPosDte39(data)).toThrow('CARD_VOUCHER_CLASSIFICATION_REQUIRED');
 });
}
