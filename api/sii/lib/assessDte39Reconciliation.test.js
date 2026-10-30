import {describe,it,expect} from 'vitest';
import {assessDte39Reconciliation as assess} from './assessDte39Reconciliation.js';
const job={state:'unknown',operation_id:'op-1',invoice_id:'inv-1',business_id:'biz-1'};
const evidence={operationId:'op-1',source:'dtecore_verified',checkedBy:'fiscal-admin',checkedAt:'2026-10-29T12:00:00Z',status:'issued',folio:123};
describe('DTE39 manual reconciliation',()=>{
 it('suggests issued only with verified matching folio',()=>expect(assess({job,evidence})).toMatchObject({decision:'manual_review_required',suggestedState:'issued',folio:123}));
 it('never treats not found as safe to resend',()=>expect(assess({job,evidence:{...evidence,status:'not_found',folio:undefined}})).toMatchObject({suggestedState:'unknown'}));
 it('rejects mismatched operation',()=>expect(()=>assess({job,evidence:{...evidence,operationId:'other'}})).toThrow('OPERATION_EVIDENCE_MISMATCH'));
 it('rejects unverified source',()=>expect(()=>assess({job,evidence:{...evidence,source:'operator_guess'}})).toThrow('PROVIDER_VERIFICATION_REQUIRED'));
 it('rejects missing reviewer',()=>expect(()=>assess({job,evidence:{...evidence,checkedBy:''}})).toThrow('REVIEWER_REQUIRED'));
 it('rejects missing folio',()=>expect(()=>assess({job,evidence:{...evidence,folio:null}})).toThrow('VALID_FOLIO_REQUIRED'));
 it('rejects already issued job',()=>expect(()=>assess({job:{...job,state:'issued'},evidence})).toThrow('RECONCILIATION_STATE_REQUIRED'));
});
