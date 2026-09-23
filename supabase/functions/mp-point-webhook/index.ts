// mp-point-webhook — POINT-SMART-2-6.
// Webhook público de Orders/Point. El payload NO es fuente de verdad: solo
// extraemos data.id como hint, localizamos una operación conocida y hacemos
// GET /v1/orders/{id} con el OAuth DEL comercio antes de persistir/finalizar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { MP_ORDERS_URL, MP_ALLOWED_STATUSES, sanitizePointOrder } from '../_shared/mpPoint.ts';

const MAX_BODY_BYTES=16*1024;
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-signature,x-request-id'};
function json(body:Record<string,unknown>,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});}
function ignored(reason:string){return json({ok:true,ignored:true,reason});}

function extractOrderId(body:Record<string,unknown>):string|null{
  const data=body.data && typeof body.data==='object' ? body.data as Record<string,unknown> : {};
  const id=data.id ?? body.id;
  return typeof id==='string' && id.length>0 && id.length<=200 ? id : null;
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({ok:false,error:'Method not allowed'},405);
  const len=Number(req.headers.get('content-length')??'0');
  if(Number.isFinite(len)&&len>MAX_BODY_BYTES) return ignored('body_too_large');

  let body:Record<string,unknown>={};
  try{const raw=await req.text();body=raw?JSON.parse(raw):{};}catch{return ignored('invalid_json');}
  const orderId=extractOrderId(body);
  if(!orderId) return ignored('missing_order_id');

  const supabaseUrl=Deno.env.get('SUPABASE_URL')??'';
  const key=getSupabaseAdminKeyOrEmpty();
  if(!supabaseUrl||!key) return json({ok:false,error:'server_configuration'},500);
  const admin=createClient(supabaseUrl,key);

  // mp_order_id es UNIQUE: el hint solo puede seleccionar una operación.
  const {data:op,error:opError}=await admin.from('crm_pos_point_operations')
    .select('*').eq('mp_order_id',orderId).maybeSingle();
  if(opError) return json({ok:false,error:'internal_error'},500);
  if(!op) return ignored('unknown_order');

  const {data:rows,error:connError}=await admin.rpc('wa_get_mp_connection_for_checkout',{p_business_id:op.business_id});
  if(connError) return json({ok:false,error:'internal_error'},500);
  const conn=Array.isArray(rows)?rows[0]:null;
  if(!conn?.access_token) return ignored('mp_not_connected');

  let res:Response;
  try{res=await fetch(`${MP_ORDERS_URL}/${encodeURIComponent(orderId)}`,{headers:{Authorization:`Bearer ${conn.access_token}`,'Content-Type':'application/json'}});}
  catch{return json({ok:false,error:'mp_fetch_failed'},502);}
  const raw=await res.text();
  if(!res.ok){
    if(res.status===401||res.status===404) return ignored('order_not_found_for_business');
    return json({ok:false,error:'mp_api_error'},502);
  }

  let order;
  try{order=sanitizePointOrder(JSON.parse(raw));}catch{return ignored('invalid_mp_response');}
  if(order.id!==op.mp_order_id||order.external_reference!==op.external_reference) return ignored('reference_mismatch');
  if(!order.status||!MP_ALLOWED_STATUSES.has(order.status)) return ignored('unknown_status');

  const update:Record<string,unknown>={
    mp_status:order.status,mp_status_detail:order.status_detail,mp_payment_id:order.payment_id,
  };
  if(order.status==='processed'&&!op.processed_at) update.processed_at=new Date().toISOString();
  const {error:syncError}=await admin.from('crm_pos_point_operations').update(update).eq('id',op.id);
  if(syncError) return json({ok:false,error:'local_sync_failed'},500);

  if(order.status==='processed'&&!op.crm_invoice_id){
    const {error:finalizeError}=await admin.rpc('crm_finalize_point_sale',{p_operation_id:op.id});
    if(finalizeError){
      // Pago ya acreditado: queremos retry de MP ante una falla transitoria de
      // finalización. Nunca se revierte ni se vuelve a cobrar.
      console.error('[mp-point-webhook] processed finalization failed:',finalizeError.message,{operationId:op.id,businessId:op.business_id});
      return json({ok:false,error:'finalization_failed'},500);
    }
  }else if(['failed','expired','canceled','refunded'].includes(order.status)){
    const {error:releaseError}=await admin.rpc('crm_point_release_stock',{p_operation_id:op.id});
    if(releaseError) console.error('[mp-point-webhook] stock release failed:',releaseError.message,{operationId:op.id});
  }

  console.log('[mp-point-webhook] order_synced',{operationId:op.id,businessId:op.business_id,status:order.status});
  return json({ok:true});
});
