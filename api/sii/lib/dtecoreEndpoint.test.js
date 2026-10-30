import {describe,it,expect} from 'vitest';
import {resolveDtecoreBaseUrl} from './dtecore39.js';
describe('tenant-specific DTECore API endpoint',()=>{
 it('accepts a dedicated HTTPS tenant host',()=>{
  expect(resolveDtecoreBaseUrl('https://tenant.example.cl/')).toBe('https://tenant.example.cl');
 });
 it.each(['','http://tenant.example.cl','https://localhost','https://127.0.0.1',
  'https://tenant.example.cl/path','https://tenant.example.cl/?token=x',
  'https://user:password@tenant.example.cl','invalid'])
 ('rejects unsafe or malformed endpoint %s',(url)=>{
  expect(()=>resolveDtecoreBaseUrl(url)).toThrow();
 });
});
