import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';

// Internal, read-only reconciliation listing. Does not claim or retry jobs.
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.FISCAL_WORKER_SECRET;
 const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 const a=Buffer.from(token||''),b=Buffer.from(secret||'');
 if(!secret||!token||a.length!==b.length||!timingSafeEqual(a,b))
   return res.status(401).json({error:'UNAUTHORIZED'});
 const limit=req.body?.limit??50;
 if(!Number.isInteger(limit)||limit<1||limit>100)
   return res.status(400).json({error:'INVALID_LIMIT'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
 try {
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc('sii_pos_dte39_reconciliation_queue',{p_limit:limit});
  if(error) throw error;
  return res.status(200).json({dryRun:true,count:data?.length??0,jobs:data??[]});
 } catch {
  return res.status(503).json({error:'RECONCILIATION_UNAVAILABLE'});
 }
}
