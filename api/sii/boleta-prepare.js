// Explicit preparation only: atomically records one fiscal operation per paid sale. Never sends a DTE.
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
    const { data: fiscalStatus, error: fiscalError } = await db.rpc('sii_pilot_fiscal_status', { p_business_id: businessId, p_sale_id: saleId });
    if (fiscalError || !fiscalStatus || fiscalStatus.issuerRegistered !== true) {
      return res.status(503).json({ error: 'FISCAL_REGISTRY_UNAVAILABLE' });
    }
    if (businessId !== 'cda904a1-e331-4bd4-9f33-a6715687d3dd' || !fiscalStatus.issuerRutMatches) {
      return res.status(403).json({ error: 'PILOT_ISSUER_NOT_ALLOWED' });
    }
    if (sale.status !== 'pagada' || !sale.paid_at || Number(sale.total) <= 0) {
      return res.status(409).json({ error: 'SALE_NOT_ELIGIBLE' });
    }
    const { data: operation, error: claimError } = await db.rpc('sii_pilot_claim_operation', {
      p_business_id: businessId, p_sale_id: saleId,
    });
    if (claimError || !operation?.operationId) {
      return res.status(409).json({ error: 'FISCAL_OPERATION_PREPARATION_FAILED' });
    }
    return res.status(200).json({
      operationId: operation.operationId,
      operationStatus: operation.status,
      emissionEnabled: false,
      folio: null,
      message: 'OPERATION_PREPARED_NO_DTE_SENT',
    });
  } catch (error) {
    return res.status(500).json({ error: 'FISCAL_PREPARATION_FAILED' });
  }
};
