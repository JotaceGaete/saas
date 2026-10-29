// Read-only fiscal preflight. This endpoint NEVER emits, claims or reserves a DTE.
import {createClient} from '@supabase/supabase-js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const token=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1];
 const {businessId,saleId}=req.body||{};
 if(!token||!UUID.test(businessId||'')||!UUID.test(saleId||''))
  return res.status(400).json({error:'INVALID_REQUEST'});
 if(businessId!=='cda904a1-e331-4bd4-9f33-a6715687d3dd')
  return res.status(403).json({error:'PILOT_ONLY'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!secret) return res.status(503).json({error:'SERVER_NOT_CONFIGURED'});
 try {
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return res.status(401).json({error:'UNAUTHORIZED'});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:business,error:businessError}=await db.from('wa_businesses')
   .select('id,user_id,country_code,is_active').eq('id',businessId).eq('user_id',user.id).maybeSingle();
  if(businessError) throw businessError;
  if(!business||business.country_code!=='CL'||business.is_active!==true)
   return res.status(403).json({error:'BUSINESS_NOT_AUTHORIZED'});
  const {data,error}=await db.rpc('sii_pilot_preflight_sale',{p_business_id:businessId,p_sale_id:saleId});
  if(error||!data) return res.status(409).json({error:'FISCAL_PREFLIGHT_UNAVAILABLE',emissionEnabled:false});
  const {data:taxMapping,error:taxError}=await db.rpc('sii_pilot_tax_mapping_status',{
    p_business_id:businessId,p_sale_id:saleId
  });
  if(taxError||!taxMapping) return res.status(503).json({error:'FISCAL_TAX_REGISTRY_UNAVAILABLE',emissionEnabled:false});
  const taxVerified=taxMapping.allAffected19Verified===true;
  return res.status(200).json({
    ...data,
    taxMappingVerified:taxVerified,
    taxItemCount:taxMapping.itemCount,
    taxVerifiedItemCount:taxMapping.verifiedItemCount,
    reason:data.saleChecksPassed && !taxVerified ? 'TAX_MAPPING_NOT_VERIFIED' : data.reason,
    eligible:false,emissionEnabled:false
  });
 } catch {
  return res.status(500).json({error:'FISCAL_PREFLIGHT_FAILED',emissionEnabled:false});
 }
}
