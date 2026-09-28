// mp-point-connection — estado y desconexión de la conexión OAuth exclusiva de Point.
// Nunca toca la conexión general de Mercado Pago / Checkout Pro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonResponse=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{status:200,headers:corsHeaders});
  if(req.method!=='POST') return jsonResponse({error:'Method not allowed',reason:'INVALID_REQUEST'},405);
  const authHeader=(req.headers.get('authorization')??'').trim();
  if(!authHeader.toLowerCase().startsWith('bearer ')) return jsonResponse({error:'User not authenticated'},401);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')??'';
  const anonKey=getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey=getSupabaseAdminKeyOrEmpty();
  if(!supabaseUrl||!anonKey||!serviceRoleKey) return jsonResponse({error:'Server configuration error'},500);

  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}}});
  const {data:userData}=await userClient.auth.getUser();
  const user=userData?.user;
  if(!user?.id) return jsonResponse({error:'User not authenticated'},401);

  const admin=createClient(supabaseUrl,serviceRoleKey);
  const {data:businesses,error:bizError}=await admin.from('wa_businesses').select('id').eq('user_id',user.id);
  if(bizError) return jsonResponse({error:'Business lookup failed'},500);
  if(!businesses?.length) return jsonResponse({error:'Business not found',reason:'no_business'},404);
  if(businesses.length!==1) return jsonResponse({error:'Business resolution ambiguous',reason:'multiple_businesses'},409);
  const businessId=businesses[0].id as string;

  let body:Record<string,unknown>={};
  try{body=await req.json();}catch{body={};}
  const action=body.action==='get'||body.action==='disconnect'?body.action:null;
  if(!action) return jsonResponse({error:'Invalid action',reason:'INVALID_REQUEST'},400);

  const {data:connection,error:connError}=await admin.from('mp_point_connections')
    .select('provider_user_id,status,connected_at,token_expires_at,live_mode')
    .eq('business_id',businessId).maybeSingle();
  if(connError) return jsonResponse({error:'Could not read Point connection'},500);

  if(action==='get'){
    return jsonResponse({ok:true,connection:connection?.status==='connected'?{
      provider_user_id:connection.provider_user_id,
      status:connection.status,
      connected_at:connection.connected_at,
      token_expires_at:connection.token_expires_at,
      live_mode:connection.live_mode,
    }:null});
  }

  // No cambiar de cuenta con un cobro Point sin resolver.
  // Solo bloquear por operaciones realmente pendientes. Historial viejo en
  // at_terminal/action_required puede quedar huérfano si MP ya lo canceló o
  // expiró; el cambio de cuenta no debe quedar secuestrado para siempre por
  // ese ledger histórico. Una operación local en 'creating' sí puede estar
  // en una ventana ambigua de creación, por lo que sigue bloqueando.
  const {data:active,error:activeError}=await admin.from('crm_pos_point_operations')
    .select('id,mp_status,mp_order_id,created_at')
    .eq('business_id',businessId)
    .in('mp_status',['creating','created','at_terminal','action_required'])
    .order('created_at',{ascending:false})
    .limit(20);
  if(activeError) return jsonResponse({error:'Could not verify active Point operations'},500);

  const ambiguousCreating=(active??[]).find((op:Record<string,unknown>)=>op.mp_status==='creating');
  if(ambiguousCreating) return jsonResponse({
    error:'Hay un cobro Point en creación. Cancélalo o recupéralo antes de cambiar la cuenta.',
    reason:'POINT_OPERATION_ACTIVE',
    operation_id:ambiguousCreating.id,
  },409);

  // Las órdenes con id remoto se reconciliarán/cancelarán desde el TPV antes
  // de iniciar otro cobro. Para cambiar de cuenta, no las usamos como lock
  // permanente: pertenecen a la conexión que justamente se está retirando.

  const {error:disconnectError}=await admin.from('mp_point_connections').update({
    status:'disconnected',disconnected_at:new Date().toISOString(),
  }).eq('business_id',businessId);
  if(disconnectError) return jsonResponse({error:'Could not disconnect Mercado Pago Point'},500);

  // La selección de terminal pertenece a la cuenta OAuth anterior.
  const {error:preferenceError}=await admin.from('crm_point_terminal_preferences').upsert({
    business_id:businessId,terminal_id:null,verification_status:'pending',selected_at:null,verified_at:null,
  },{onConflict:'business_id'});
  if(preferenceError) return jsonResponse({error:'Point disconnected but terminal preference could not be cleared',reason:'POINT_PREFERENCE_CLEAR_FAILED'},500);

  return jsonResponse({ok:true,connection:null});
});
