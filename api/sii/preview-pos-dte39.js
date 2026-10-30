import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {previewPaidPosDte39} from './lib/previewPaidPosDte39.js';

// Server-only dry run. Never claims a job, changes DB state or emits DTE.
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.FISCAL_WORKER_SECRET;
 const provided=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 const a=Buffer.from(provided||''),b=Buffer.from(secret||'');
 if(!secret||!provided||a.length!==b.length||!timingSafeEqual(a,b))
   return res.status(401).json({error:'UNAUTHORIZED'});
 const jobId=req.body?.jobId;
 if(typeof jobId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId))
   return res.status(400).json({error:'INVALID_JOB_ID'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
 try {
   const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await db.rpc('sii_pos_dte39_job_snapshot',{p_job_id:jobId});
   if(error) throw error;
   if(!data) return res.status(404).json({error:'JOB_NOT_FOUND'});
   const result=previewPaidPosDte39(data);
   return res.status(200).json({ready:true,documentType:39,total:result.total,
     lines:result.lines,paymentCode:result.paymentCode,dryRun:true});
 } catch(e) {
   const reason=String(e?.message||'PREVIEW_FAILED');
   return res.status(409).json({ready:false,reason:/^[A-Z][A-Z0-9_]{2,80}$/.test(reason)?reason:'PREVIEW_FAILED',dryRun:true});
 }
}
