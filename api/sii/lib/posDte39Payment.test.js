import {describe,it,expect} from 'vitest';
import {resolveDte39PaymentCode} from './posDte39Payment.js';
const payment=(payment_method,amount=1000)=>({payment_method,amount,payment_status:'received',voided_at:null});
describe('POS DTE39 tender mapping',()=>{
 it('maps cash',()=>expect(resolveDte39PaymentCode([payment('cash')],1000)).toBe('EF'));
 it('maps Mercado Pago Point card',()=>expect(resolveDte39PaymentCode([payment('mercado_pago')],1000)).toBe('TC'));
 it('maps debit card',()=>expect(resolveDte39PaymentCode([payment('debit_card')],1000)).toBe('TD'));
 it('rejects unconfirmed payments',()=>expect(()=>resolveDte39PaymentCode([{...payment('card'),payment_status:'pending'}],1000)).toThrow('UNCONFIRMED_PAYMENT'));
 it('rejects unmatched totals',()=>expect(()=>resolveDte39PaymentCode([payment('cash')],900)).toThrow('PAYMENTS_TOTAL_MISMATCH'));
 it('blocks unmapped bank transfer',()=>expect(()=>resolveDte39PaymentCode([payment('bank_transfer')],1000)).toThrow('PAYMENT_METHOD_REQUIRES_MAPPING'));
 it('blocks mixed tender',()=>expect(()=>resolveDte39PaymentCode([payment('cash',500),payment('card',500)],1000)).toThrow('MIXED_TENDER_REQUIRES_POLICY'));
});
