// Internal read-only fiscal preview. No claim, provider call or issuance.
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {previewPaidPosDte39} from './lib/previewPaidPosDte39.js';

function authorized(value,secret) {
  if (!value || !secret) return false;
  const a=Buffer.from(value),b=Buffer.from(secret);
  return a.length===b.length && timingSafeEqual(a,b);
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
  if (!authorized(token,process.env.FISCAL_WORKER_SECRET))
    return res.status(401).json({error:'UNAUTHORIZED'});
  const id=req.body?.jobId;
  if (typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return res.status(400).json({error:'INVALID_JOB_ID'});
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url||!key) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const read=async query=>{const {data,error}=await query;if(error)throw error;return data;};
  try {
    const job=await read(db.schema('fiscal').from('pos_dte39_outbox')
      .select('id,business_id,invoice_id,operation_id,document_type').eq('id',id).maybeSingle());
    if (!job) return res.status(404).json({error:'JOB_NOT_FOUND'});
    const [invoice,business,issuer,taxConfig,items,payments]=await Promise.all([
      read(db.from('crm_invoices').select('id,business_id,source,status,paid_at,issue_date,total').eq('id',job.invoice_id).eq('business_id',job.business_id).maybeSingle()),
      read(db.from('wa_businesses').select('country_code').eq('id',job.business_id).maybeSingle()),
      read(db.schema('fiscal').from('issuers').select('issuer_rut,enabled,verified').eq('business_id',job.business_id).maybeSingle()),
      read(db.schema('fiscal').from('business_tax_defaults').select('default_is_exempt,confirmed_by_owner').eq('business_id',job.business_id).maybeSingle()),
      read(db.from('crm_invoice_items').select('name,description,unit_price,quantity,subtotal').eq('invoice_id',job.invoice_id).order('sort_order')),
      read(db.from('crm_payments').select('payment_method,payment_status,amount,voided_at').eq('invoice_id',job.invoice_id).eq('business_id',job.business_id))
    ]);
    const preview=previewPaidPosDte39({job,invoice,business,issuer,taxConfig,items,payments});
    return res.status(200).json({ready:true,total:preview.total,lines:preview.lines,
      paymentCode:preview.paymentCode,documentType:39,simulationOnly:true});
  } catch(error) {
    const reason=String(error?.message||'PREVIEW_FAILED');
    return res.status(409).json({ready:false,reason:/^[A-Z][A-Z0-9_]+$/.test(reason)?reason:'PREVIEW_FAILED'});
  }
}
