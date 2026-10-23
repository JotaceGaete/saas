// OAuth start exclusivo de Mercado Pago Point.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { getMpPointOauthCredentials } from '../_shared/mpPointOauthCredentials.ts';
import { generateCodeVerifier,generateState,generateCodeChallenge,hashState,buildAuthorizationUrl } from '../mp-oauth-start/lib.ts';

const AUTH_URL='https://auth.mercadopago.com/authorization';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const auth=(req.headers.get('authorization')??'').trim();
  if(!auth.toLowerCase().startsWith('bearer ')) return json({error:'User not authenticated'},401);

  const url=Deno.env.get('SUPABASE_URL')??'';
  const anon=getSupabasePublishableKeyOrEmpty();
  const adminKey=getSupabaseAdminKeyOrEmpty();
  const redirectUri=Deno.env.get('MP_POINT_OAUTH_REDIRECT_URI')??'';
  if(!url||!anon||!adminKey||!redirectUri) return json({error:'Server configuration error'},500);

  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:userData}=await userClient.auth.getUser();
  const user=userData?.user;
  if(!user?.id) return json({error:'User not authenticated'},401);

  const admin=createClient(url,adminKey);
  const {data:businesses,error:bizError}=await admin.from('wa_businesses')
    .select('id,user_id,country_code').eq('user_id',user.id);
  if(bizError) return json({error:'Business lookup failed'},500);
  if(!businesses||businesses.length===0) return json({error:'Business not found',reason:'no_business'},404);
  if(businesses.length!==1) return json({error:'Business resolution ambiguous',reason:'multiple_businesses'},409);
  const business=businesses[0];

  const creds=getMpPointOauthCredentials(business.country_code);
  if(!creds.ok) return json({error:'Mercado Pago Point no está configurado para tu país',reason:'MP_POINT_COUNTRY_NOT_CONFIGURED'},422);

  const state=generateState();
  const verifier=generateCodeVerifier();
  const challenge=await generateCodeChallenge(verifier);
  const stateHash=await hashState(state);
  const {error:stateError}=await admin.rpc('wa_create_mp_point_oauth_state',{
    p_business_id:business.id,p_user_id:user.id,p_state_hash:stateHash,
    p_code_verifier:verifier,p_ttl_seconds:600,
  });
  if(stateError){console.error('[mp-point-oauth-start] state create failed:',stateError.message);return json({error:'Server configuration error'},500);}

  const authorizationUrl=buildAuthorizationUrl({
    authBaseUrl:AUTH_URL,clientId:creds.credentials.clientId,redirectUri,state,codeChallenge:challenge,
  });
  return json({authorizationUrl});
});
