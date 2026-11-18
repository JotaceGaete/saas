// CANDIDATO PARA REVISIÓN — NO DESPLEGADO.
// Destino al autorizar el montaje: api/storefront.js (copia literal de este archivo).
// Crear una única función serverless nueva. Solo GET (el handler devuelve 405 para el resto).
//
// Rewrite requerido en vercel.json (ver vercel.json.proposed), colocado en la PRIMERA posición:
//   { "source": "/api/v1/storefront/:path*", "destination": "/api/storefront?p=:path*" }
//
// Seguridad:
//  - Usa SUPABASE_SERVICE_ROLE_KEY solo en servidor (variable ya existente en api/og-catalog.js).
//  - Las funciones storefront_* tienen EXECUTE solo para service_role (migración 0001).
//  - Respuestas públicas: Cache-Control lo fija el handler (s-maxage=60).

import { createClient } from '@supabase/supabase-js';
import { createStorefrontHandlerFromEnv } from '../backend/src/storefront/handler.js';
import { createSupabaseRpc } from '../backend/src/storefront/sqlSelect.js';

let cachedHandle = null;

function getHandle() {
  if (cachedHandle) return cachedHandle;
  const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  cachedHandle = createStorefrontHandlerFromEnv({ rpc: createSupabaseRpc(client) });
  return cachedHandle;
}

function unavailable() {
  return new Response(
    JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Servicio no disponible' } }),
    { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
}

export async function GET(request) {
  const incoming = new URL(request.url);
  // El rewrite entrega la ruta restante en ?p= (p.ej. "stores/tienda/products").
  const path = incoming.searchParams.get('p') || '';
  if (!path) return unavailable();

  const handle = getHandle();
  if (!handle) return unavailable();

  // El handler espera /v1/stores/... en el pathname. Los parámetros de consulta
  // se conservan, excepto el parámetro interno p.
  const forwarded = new URL(`/v1/${path}`, incoming.origin);
  for (const [k, v] of incoming.searchParams) {
    if (k !== 'p') forwarded.searchParams.append(k, v);
  }
  return handle(new Request(forwarded, { method: 'GET', headers: request.headers }));
}
