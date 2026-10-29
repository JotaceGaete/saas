// Manual, preview-only pilot batch. Never emits a DTE or charges a payment.
// Disabled by default even in Preview; requires explicit server-side enablement.
import {createClient} from '@supabase/supabase-js';
import runner from '../../scripts/sii/point-fiscal-outbox-runner.cjs';
const {runPointFiscalOutboxBatch}=runner;
const PILOT='cda904a1-e331-4bd4-9f33-a6715687d3dd';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 if(process.env.VERCEL_ENV!=='preview'||process.env.SII_POINT_OUTBOX_PREVIEW_ENABLED!=='true')
  return res.status(404).json({error:'NOT_AVAILABLE'});
 const configured=process.env.SII_POINT_OUTBOX_RUN_SECRET;
 const supplied=req.headers['x-sii-outbox-secret'];
 if(typeof configured!=='string'||configured.length<32||
    typeof supplied!=='string'||supplied.length!==configured.length){
  return res.status(401).json({error:'UNAUTHORIZED'});
 }
 // Compare without early exit after length check.
 let diff=0;for(let i=0;i<configured.length;i++) diff|=configured.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff!==0) return res.status(401).json({error:'UNAUTHORIZED'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({error:'NOT_CONFIGURED'});
 try{
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await runPointFiscalOutboxBatch({
   db,limit:Math.min(5,Math.max(1,Number.isInteger(req.body?.limit)?req.body.limit:1)),
   loadSale:async({businessId,saleId})=>{
    if(businessId!==PILOT) throw Error('PILOT_ONLY');
    const {data,error}=await db.from('crm_invoices')
     .select('id,business_id,status,paid_at,total').eq('id',saleId).eq('business_id',businessId).maybeSingle();
    if(error) throw error;return data;
   },
   getMerchantAccessToken:async({businessId})=>{
    if(businessId!==PILOT) throw Error('PILOT_ONLY');
    const {data,error}=await db.rpc('wa_get_mp_point_connection',{p_business_id:businessId});
    const conn=Array.isArray(data)?data[0]:null;
    if(error||!conn?.access_token||conn.live_mode!==true||
       !conn.token_expires_at||!Number.isFinite(Date.parse(conn.token_expires_at))||
       Date.parse(conn.token_expires_at)<=Date.now()) throw Error('POINT_TOKEN_UNAVAILABLE');
    return conn.access_token;
   },
   prepareFiscal:async({businessId,saleId,operationKey})=>{
    if(businessId!==PILOT) throw Error('PILOT_ONLY');
    const {data:status,error:statusError}=await db.rpc('sii_pilot_fiscal_status',{
     p_business_id:businessId,p_sale_id:saleId});
    if(statusError||status?.issuerRegistered!==true||status?.issuerRutMatches!==true)
     throw Error('ISSUER_NOT_CONFIGURED');
    const {data:op,error}=await db.rpc('sii_pilot_claim_operation',{
     p_business_id:businessId,p_sale_id:saleId});
    if(error||!op?.operationId||op.operationKey!==operationKey||op.status!=='pending'||
       op.emissionEnabled!==false) throw Error('FISCAL_CLAIM_FAILED');
    return {operationKey:op.operationKey,status:op.status};
   }
  });
  return res.status(200).json(result);
 }catch{
  return res.status(503).json({error:'OUTBOX_RUN_FAILED',emissionEnabled:false});
 }
}
