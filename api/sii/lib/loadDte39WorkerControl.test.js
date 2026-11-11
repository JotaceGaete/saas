import {describe,it,expect} from 'vitest';
import {loadDte39WorkerControl as load} from './loadDte39WorkerControl.js';
describe('fiscal worker secondary kill switch',()=>{
 it('is disabled by default',()=>expect(load({})).toEqual({
  enabled:false,payment_voucher_policy_approved:false
 }));
 it('requires both explicit emission and worker approvals',()=>{
  expect(load({DTECORE_ENABLE_EMISSION:'true'}).enabled).toBe(false);
  expect(load({FISCAL_DTE39_WORKER_APPROVED:'true'}).enabled).toBe(false);
 });
 it('does not infer voucher approval',()=>{
  expect(load({DTECORE_ENABLE_EMISSION:'true',FISCAL_DTE39_WORKER_APPROVED:'true'}))
   .toEqual({enabled:true,payment_voucher_policy_approved:false});
 });
 it('requires exact true strings',()=>{
  expect(load({DTECORE_ENABLE_EMISSION:'TRUE',FISCAL_DTE39_WORKER_APPROVED:'true'}).enabled).toBe(false);
 });
});
