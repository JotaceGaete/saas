import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const run=vi.fn();
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn(()=>({rpc:vi.fn()}))}));
vi.mock('./lib/runNextDte39Job.js',()=>({runNextDte39Job:(args)=>run(args)}));
import handler from './process-pos-dte39.js';
const original={...process.env};
function response(){
 const res={statusCode:200,body:null,headers:{}};
 res.setHeader=(k,v)=>{res.headers[k]=v;return res;};
 res.status=(code)=>{res.statusCode=code;return res;};
 res.json=(body)=>{res.body=body;return res;};
 return res;
}
beforeEach(()=>{
 process.env.FISCAL_WORKER_SECRET='private-token';
 delete process.env.DTECORE_ENABLE_EMISSION;
 delete process.env.FISCAL_DTE39_WORKER_APPROVED;
 delete process.env.FISCAL_DTE39_VOUCHER_POLICY_APPROVED;
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='private-service-key';
 run.mockReset();
});
afterEach(()=>{process.env={...original};});
describe('fiscal worker HTTP boundary',()=>{
 it('rejects unauthenticated requests',async()=>{
  const res=response();
  await handler({method:'POST',headers:{}},res);
  expect(res.statusCode).toBe(401);expect(run).not.toHaveBeenCalled();
 });
 it('rejects unsupported methods',async()=>{
  const res=response();
  await handler({method:'GET',headers:{}},res);
  expect(res.statusCode).toBe(405);
 });
 it('remains disabled with a valid token by default',async()=>{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer private-token'}},res);
  expect(res.statusCode).toBe(423);expect(run).not.toHaveBeenCalled();
 });
 it('requires all three approvals',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  process.env.FISCAL_DTE39_WORKER_APPROVED='true';
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer private-token'}},res);
  expect(res.statusCode).toBe(423);expect(run).not.toHaveBeenCalled();
 });
 it('runs one job only with explicit approval and private service credentials',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  process.env.FISCAL_DTE39_WORKER_APPROVED='true';
  process.env.FISCAL_DTE39_VOUCHER_POLICY_APPROVED='true';
  run.mockResolvedValue({status:'idle'});
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer private-token'}},res);
  expect(res.statusCode).toBe(200);expect(res.body).toEqual({status:'idle'});
  expect(run).toHaveBeenCalledOnce();
 });
 it('does not expose internal errors or secrets',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  process.env.FISCAL_DTE39_WORKER_APPROVED='true';
  process.env.FISCAL_DTE39_VOUCHER_POLICY_APPROVED='true';
  run.mockRejectedValue(new Error('private-service-key'));
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer private-token'}},res);
  expect(res.statusCode).toBe(503);
  expect(JSON.stringify(res.body)).not.toContain('private-service-key');
 });
});
