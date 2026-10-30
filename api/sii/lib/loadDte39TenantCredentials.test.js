import {describe,it,expect} from 'vitest';
import {loadDte39TenantCredentials as load} from './loadDte39TenantCredentials.js';
const a='cda904a1-e331-4bd4-9f33-a6715687d3dd';
const b='11111111-2222-4333-8444-555555555555';
const raw=JSON.stringify({[a]:{enabled:true,apiKey:'key-a',baseUrl:'https://tenant-a.example.cl'},
 [b]:{enabled:false,apiKey:'key-b',baseUrl:'https://tenant-b.example.cl'}});
describe('DTECore tenant secret lookup',()=>{
 it('selects only the requested tenant',()=>{
  expect(load(a,raw)).toEqual({business_id:a,apiKey:'key-a',baseUrl:'https://tenant-a.example.cl'});
 });
 it('rejects disabled tenants',()=>expect(()=>load(b,raw)).toThrow('DTECORE_TENANT_NOT_CONFIGURED'));
 it('rejects missing tenants',()=>expect(()=>load('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',raw)).toThrow('DTECORE_TENANT_NOT_CONFIGURED'));
 it('rejects invalid tenant ids',()=>expect(()=>load('__proto__',raw)).toThrow('BUSINESS_ID_INVALID'));
 it('rejects malformed JSON',()=>expect(()=>load(a,'{')).toThrow('DTECORE_TENANTS_INVALID'));
 it('rejects missing secrets',()=>expect(()=>load(a,'')).toThrow('DTECORE_TENANTS_NOT_CONFIGURED'));
 it('rejects invalid configuration shape',()=>expect(()=>load(a,'[]')).toThrow('DTECORE_TENANTS_INVALID'));
});
