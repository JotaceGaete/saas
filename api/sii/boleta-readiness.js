// Read-only DTE39 pilot readiness. Never issues documents or reserves folios.
// Uses user JWT for identity; private fiscal registry read requires service role server-side.
import { createClient } from '@supabase/supabase-js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
  const {businessId,saleId} = req.body || {};
  if(!token || !UUID.test(businessId || '') || !UUID.test(saleId || ''))
    return res.status(400).json({error:'INVALID_REQUEST'});
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !anon || !secret) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
  try {
    const userClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await userClient.auth.getUser(token);
    if(authError || !user) return res.status(401).json({error:'UNAUTHORIZED'});
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:business,error:businessError}=await db.from('wa_businesses')
      .select('id,user_id,country_code,is_active').eq('id',businessId).eq('user_id',user.id).maybeSingle();
    if(businessError) throw businessError;
    if(!business || business.country_code!=='CL' || !business.is_active)
      return res.status(403).json({error:'BUSINESS_NOT_AUTHORIZED'});
    const {data:sale,error:saleError}=await db.from('crm_invoices')
      .select('id,business_id,status,paid_at,total').eq('id',saleId).eq('business_id',businessId).maybeSingle();
    if(saleError) throw saleError;
    if(!sale) return res.status(404).json({error:'SALE_NOT_FOUND'});
    // Private fiscal schema is not exposed by default. Never assume a public Data API route.
    // Emission requires a dedicated server-side DB connection and reviewed atomic claim.
    return res.status(200).json({
      documentType:39, emissionEnabled:false, eligible:false,
      salePaid:sale.status==='pagada' && Boolean(sale.paid_at),
      providerConfigured:Boolean(process.env.SII_SOLUTIONS_API_KEY_BONITA_CASUALIDAD),
      privateFiscalRegistryVerified:false,
      idempotentIssuanceVerified:false,
      reason:'FISCAL_ISSUANCE_LOCKED',
      next:'Verify issuer RUT, provider key, private DB access and durable idempotency'
    });
  } catch(error) {
    return res.status(500).json({error:'FISCAL_READINESS_FAILED'});
  }
};
