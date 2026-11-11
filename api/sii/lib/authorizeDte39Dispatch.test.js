import {describe,it,expect} from 'vitest';
import {authorizeDte39Dispatch as authorize} from './authorizeDte39Dispatch.js';
const fixture=()=>({
 job:{id:'j1',document_type:39,state:'claimed',business_id:'shop-a',operation_id:'op-a'},
 control:{enabled:true,payment_voucher_policy_approved:true},
 issuer:{business_id:'shop-a',enabled:true,verified:true},
 credentials:{business_id:'shop-a',apiKey:'secret',baseUrl:'https://tenant.example.cl'}
});
describe('DTE39 dispatch authorization',()=>{
 it('permits an isolated, claimed and fully approved tenant',()=>{
  expect(authorize(fixture())).toMatchObject({businessId:'shop-a',operationId:'op-a'});
 });
 it.each(['pending','unknown','issued','failed'])('rejects unclaimed state %s',state=>{
  const data=fixture();data.job.state=state;
  expect(()=>authorize(data)).toThrow('DTE39_CLAIM_REQUIRED');
 });
 it('blocks emission until fiscal policy is approved',()=>{
  const data=fixture();data.control.payment_voucher_policy_approved=false;
  expect(()=>authorize(data)).toThrow('FISCAL_DISPATCH_DISABLED');
 });
 it('blocks emission while globally disabled',()=>{
  const data=fixture();data.control.enabled=false;
  expect(()=>authorize(data)).toThrow('FISCAL_DISPATCH_DISABLED');
 });
 it('blocks unverified issuers',()=>{
  const data=fixture();data.issuer.verified=false;
  expect(()=>authorize(data)).toThrow('ISSUER_NOT_VERIFIED');
 });
 it('blocks cross-business issuer credentials',()=>{
  const data=fixture();data.credentials.business_id='shop-b';
  expect(()=>authorize(data)).toThrow('DTECORE_TENANT_CREDENTIALS_REQUIRED');
 });
 it('blocks cross-business fiscal issuer',()=>{
  const data=fixture();data.issuer.business_id='shop-b';
  expect(()=>authorize(data)).toThrow('ISSUER_NOT_VERIFIED');
 });
 it('blocks absent credentials',()=>{
  const data=fixture();data.credentials.apiKey='';
  expect(()=>authorize(data)).toThrow('DTECORE_TENANT_CREDENTIALS_REQUIRED');
 });
});
