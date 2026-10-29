// Pilot-only server endpoint: finalized Point -> verified MP order -> fiscal operation.
// Does not issue a DTE and does not write a second CRM payment.
import {createClient} from '@supabase/supabase-js';
import pointBridge from '../../scripts/sii/point-finalized-fiscal.cjs';
const {prepareFinalizedPointFiscal}=pointBridge;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PILOT='cda904a1-e331-4bd4-9f33-a6715687d3dd';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const {businessId,saleId}=req.body||{};
 const jwt=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!jwt||!UUID.test(businessId||'')||!UUID.test(saleId||''))
  return res.status(400).json({error:'INVALID_REQUEST'});
 if(businessId!==PILOT) return res.status(403).json({error:'PILOT_ONLY'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!secret) return res.status(503).json({error:'NOT_CONFIGURED'});
 try {
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(jwt);
  if(authError||!user) return res.status(401).json({error:'UNAUTHORIZED'});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:business,error:businessError}=await db.from('wa_businesses')
   .select('id,user_id,country_code,is_active').eq('id',businessId).eq('user_id',user.id).maybeSingle();
  if(businessError||!business||business.country_code!=='CL'||!business.is_active)
   return res.status(403).json({error:'BUSINESS_NOT_AUTHORIZED'});
  const result=await prepareFinalizedPointFiscal({
   db,businessId,saleId,
   loadSale:async({businessId,saleId})=>{
    const {data,error}=await db.from('crm_invoices')
     .select('id,business_id,status,paid_at,total').eq('id',saleId).eq('business_id',businessId).maybeSingle();
    if(error) throw error;return data;
   },
   getMerchantAccessToken:async({businessId})=>{
    const {data,error}=await db.rpc('wa_get_mp_point_connection',{p_business_id:businessId});
    const conn=Array.isArray(data)?data[0]:null;
    if(error||!conn?.access_token||conn.token_expires_at&&Date.parse(conn.token_expires_at)<=Date.now())
     throw Error('POINT_TOKEN_UNAVAILABLE');
    return conn.access_token;
   },
   prepareFiscal:async({businessId,saleId,operationKey})=>{
    const {data:status,error:statusError}=await db.rpc('sii_pilot_fiscal_status',{
     p_business_id:businessId,p_sale_id:saleId});
    if(statusError||!status?.issuerRegistered||!status?.issuerRutMatches)
     throw Error('ISSUER_NOT_VERIFIED');
    const {data:op,error}=await db.rpc('sii_pilot_claim_operation',{
     p_business_id:businessId,p_sale_id:saleId});
    if(error||!op?.operationId||op.operationKey!==operationKey||op.status!=='pending'||
       op.emissionEnabled!==false) throw Error('FISCAL_CLAIM_FAILED');
    return {operationKey:op.operationKey,status:op.status};
   }
  });
  return res.status(result.status==='prepared'?200:409).json(result);
 }catch{return res.status(500).json({error:'POINT_FISCAL_PREPARATION_FAILED',emissionEnabled:false});}
}
