import {describe,it,expect} from 'vitest';
import {preparePosDte39} from './preparePosDte39.js';
const base = () => ({
  invoice:{id:'sale-1',source:'pos',status:'pagada',paid_at:'2026-10-29T12:00:00Z',issue_date:'2026-10-29',total:1000},
  business:{country_code:'CL'},
  issuer:{enabled:true,verified:true,issuer_rut:'77804207-K'},
  taxConfig:{confirmed_by_owner:true,default_is_exempt:false},
  items:[{name:'Producto',unit_price:1000,quantity:1,subtotal:1000}],
  operationId:'WALINKA-DTE39-sale-1',paymentCode:'TC'
});
describe('prepare taxable POS DTE39',()=>{
  it('prepares an IVA-inclusive paid card sale',()=>{
    const sale=preparePosDte39(base());
    expect(sale.total).toBe(1000);
    expect(sale.items[0].isExempt).toBe(false);
    expect(sale.paymentCode).toBe('TC');
  });
  it('rejects unapproved payment',()=>{
    const x=base();x.invoice.status='pendiente';
    expect(()=>preparePosDte39(x)).toThrow('SALE_NOT_PAID');
  });
  it('rejects unverified issuer',()=>{
    const x=base();x.issuer.verified=false;
    expect(()=>preparePosDte39(x)).toThrow('ISSUER_NOT_VERIFIED');
  });
  it('rejects unmatched total',()=>{
    const x=base();x.invoice.total=999;
    expect(()=>preparePosDte39(x)).toThrow('TOTAL_RECONCILIATION_REQUIRED');
  });
  it('rejects missing tender provenance',()=>{
    const x=base();delete x.paymentCode;
    expect(()=>preparePosDte39(x)).toThrow('PAYMENT_CODE_REQUIRED');
  });
});
