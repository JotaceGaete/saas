// Internal fiscal worker endpoint. No public or browser access.
// All emission requires an explicit deployment opt-in AND database claim gate.
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {runNextDte39Job} from './lib/runNextDte39Job.js';
import {loadDte39TenantCredentials} from './lib/loadDte39TenantCredentials.js';
import {loadDte39WorkerControl} from './lib/loadDte39WorkerControl.js';

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.FISCAL_WORKER_SECRET;
 const provided=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 const a=Buffer.from(provided||''),b=Buffer.from(secret||'');
 if(!secret||!provided||a.length!==b.length||!timingSafeEqual(a,b))
  return res.status(401).json({error:'UNAUTHORIZED'});
 const control=loadDte39WorkerControl();
 if (!control.enabled || !control.payment_voucher_policy_approved)
  return res.status(423).json({error:'FISCAL_EMISSION_DISABLED'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
 try {
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await runNextDte39Job({
   db,loadControl:async()=>control,
   loadCredentials:async businessId=>loadDte39TenantCredentials(businessId)
  });
  // Never return provider keys or provider response bodies.
  return res.status(result.status==='requires_review'?409:200).json(result);
 } catch {
  return res.status(503).json({error:'FISCAL_WORKER_UNAVAILABLE'});
 }
}
