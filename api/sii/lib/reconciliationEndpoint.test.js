import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const rpc=vi.fn();
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc})}));
import handler from '../reconciliation-pos-dte39.js';

function invoke({method='POST',authorization,body={}}={}){
 const req={method,headers:{authorization},body};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
 return handler(req,res).then(()=>res);
}
describe('fiscal reconciliation endpoint security',()=>{
 beforeEach(()=>{
  process.env.FISCAL_WORKER_SECRET='test-secret';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';
  rpc.mockReset();
 });
 afterEach(()=>{delete process.env.FISCAL_WORKER_SECRET;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;});
 it('rejects unauthenticated access without reading DB',async()=>{
  const res=await invoke();expect(res.statusCode).toBe(401);expect(rpc).not.toHaveBeenCalled();
 });
 it('rejects non-POST requests',async()=>{
  const res=await invoke({method:'GET'});expect(res.statusCode).toBe(405);expect(rpc).not.toHaveBeenCalled();
 });
 it('rejects invalid limit',async()=>{
  const res=await invoke({authorization:'Bearer test-secret',body:{limit:101}});
  expect(res.statusCode).toBe(400);expect(rpc).not.toHaveBeenCalled();
 });
 it('reads reconciliation jobs without mutating records',async()=>{
  rpc.mockResolvedValue({data:[{state:'unknown',operation_id:'op-1'}],error:null});
  const res=await invoke({authorization:'Bearer test-secret',body:{limit:10}});
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({dryRun:true,count:1});
  expect(rpc).toHaveBeenCalledExactlyOnceWith('sii_pos_dte39_reconciliation_queue',{p_limit:10});
 });
 it('returns unavailable on database error',async()=>{
  rpc.mockResolvedValue({data:null,error:new Error('db')});
  const res=await invoke({authorization:'Bearer test-secret'});
  expect(res.statusCode).toBe(503);
 });
});
