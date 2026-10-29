// OAuth callback exclusivo de Mercado Pago Point.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { getMpPointOauthCredentials } from '../_shared/mpPointOauthCredentials.ts';
import { hashState,buildTokenExchangeBody,parseMpTokenResponse } from '../mp-oauth-callback/lib.ts';

const TOKEN_URL='https://api.mercadopago.com/oauth/token';
const DEFAULT_RETURN='https://go.walinka.com';
const redirect=(base:string,status:'connected'|'error')=>{
  const u=new URL('/crm/terminal',base);u.searchParams.set('mp_point',status);
  return new Response(null,{status:302,headers:{Location:u.toString()}});
};

Deno.serve(async(req)=>{
  const u=new URL(req.url);
  const code=u.searchParams.get('code');
  const state=u.searchParams.get('state');
  const base=Deno.env.get('MP_POINT_OAUTH_APP_RETURN_URL')??Deno.env.get('MP_OAUTH_APP_RETURN_URL')??DEFAULT_RETURN;
  const sbUrl=Deno.env.get('SUPABASE_URL')??'';
  const key=getSupabaseAdminKeyOrEmpty();
  const redirectUri=Deno.env.get('MP_POINT_OAUTH_REDIRECT_URI')??'';
  if(!sbUrl||!key||!redirectUri||u.searchParams.get('error')||!code||!state) return redirect(base,'error');

  const db=createClient(sbUrl,key);
  const stateHash=await hashState(state);
  const {data:rows,error:consumeError}=await db.rpc('wa_consume_mp_point_oauth_state',{p_state_hash:stateHash});
  const consumed=Array.isArray(rows)?rows[0]:null;
  if(consumeError||!consumed){console.warn('[mp-point-oauth-callback] invalid state');return redirect(base,'error');}

  const businessId=consumed.business_id as string;
  const {data:biz,error:bizError}=await db.from('wa_businesses').select('country_code').eq('id',businessId).maybeSingle();
  if(bizError||!biz) return redirect(base,'error');
  const creds=getMpPointOauthCredentials(biz.country_code);
  if(!creds.ok) return redirect(base,'error');

  const tokenBody=buildTokenExchangeBody({
    clientId:creds.credentials.clientId,clientSecret:creds.credentials.clientSecret,
    code,redirectUri,codeVerifier:consumed.code_verifier as string,
  });
  let res:Response;
  try{res=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tokenBody)});}
  catch{return redirect(base,'error');}
  const raw=await res.text();
  if(!res.ok){console.error('[mp-point-oauth-callback] token exchange status:',res.status);return redirect(base,'error');}
  let parsedJson:Record<string,unknown>;
  try{parsedJson=JSON.parse(raw);}catch{return redirect(base,'error');}
  const parsed=parseMpTokenResponse(parsedJson);
  if(!parsed.ok) return redirect(base,'error');

  const {error:saveError}=await db.rpc('wa_upsert_mp_point_connection',{
    p_business_id:businessId,p_provider_user_id:parsed.token.providerUserId,
    p_access_token:parsed.token.accessToken,p_refresh_token:parsed.token.refreshToken,
    p_expires_in_seconds:parsed.token.expiresInSeconds,p_scope:parsed.token.scope,p_live_mode:parsed.token.liveMode,
  });
  if(saveError){console.error('[mp-point-oauth-callback] save failed:',saveError.message);return redirect(base,'error');}
  console.log('[mp-point-oauth-callback] point_connection_created',{businessId});
  return redirect(base,'connected');
});
