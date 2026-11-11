import {describe,it,expect,vi,afterEach} from 'vitest';
import {emitDte39Claimed} from './dtecore39.js';
const payload={idBoletaOperacion:'op-123',detalles:[{precioSubtotal:1000}]};
const original=process.env.DTECORE_ENABLE_EMISSION;
afterEach(()=>{if(original===undefined) delete process.env.DTECORE_ENABLE_EMISSION;else process.env.DTECORE_ENABLE_EMISSION=original;});
describe('DTECore emission transport boundaries',()=>{
 it('uses tenant HTTPS endpoint and API key only in headers',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({folio:42}),headers:{get:()=>null}});
  const result=await emitDte39Claimed({payload,apiKey:'test-key',baseUrl:'https://tenant.example.cl',fetchImpl});
  expect(result.folio).toBe(42);
  expect(fetchImpl).toHaveBeenCalledOnce();
  const [url,options]=fetchImpl.mock.calls[0];
  expect(url).toBe('https://tenant.example.cl/dte/boletas/emitir');
  expect(options.headers['X-Api-Key']).toBe('test-key');
  expect(url).not.toContain('test-key');
 });
 it('rejects missing tenant URL without contacting provider',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  const fetchImpl=vi.fn();
  await expect(emitDte39Claimed({payload,apiKey:'test-key',baseUrl:'',fetchImpl})).rejects.toThrow('DTECORE_BASE_URL_REQUIRED');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects missing folio as uncertain outcome',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true}),headers:{get:()=>null}});
  await expect(emitDte39Claimed({payload,apiKey:'test-key',baseUrl:'https://tenant.example.cl',fetchImpl})).rejects.toThrow('DTECORE_RESPONSE_INVALID');
 });
 it('preserves provider failure instead of claiming issuance',async()=>{
  process.env.DTECORE_ENABLE_EMISSION='true';
  const fetchImpl=vi.fn().mockResolvedValue({ok:false,status:503,json:async()=>({}),headers:{get:()=>null}});
  await expect(emitDte39Claimed({payload,apiKey:'test-key',baseUrl:'https://tenant.example.cl',fetchImpl})).rejects.toThrow('DTECORE_HTTP_503');
 });
});
