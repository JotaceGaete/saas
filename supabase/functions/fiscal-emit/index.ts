// Supabase Edge Function: emisor fiscal DTE 39. Envoltorio Deno sobre la lógica probada en lib/.
//
// ESTADO: NO VERIFICADO EN RUNTIME. Deno no está instalado en el entorno de desarrollo; la lógica
// está cubierta por node --test (lib/http.mjs, lib/emit.mjs, lib/store-supabase.mjs). Antes de
// desplegar hay que ejecutar `supabase functions serve fiscal-emit` contra una base local.
//
// Seguridad:
//  - Requiere Authorization: Bearer <JWT de usuario>. El usuario se resuelve con auth.getUser().
//  - El cliente de datos usa SUPABASE_SERVICE_ROLE_KEY y nunca se expone al navegador.
//  - La clave maestra de cifrado vive solo en FISCAL_MASTER_KEY (servidor).
//  - El proveedor es DTECore BLOQUEADO hasta verificar el contrato: esta función no emite nada hoy.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createFiscalEmitter } from './lib/emit.mjs';
import { createSupabaseStore } from './lib/store-supabase.mjs';
import { createDtecoreBlockedProvider } from './lib/providers/dtecore-blocked.mjs';
import { createHttpHandler } from './lib/http.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MASTER_KEY = Deno.env.get('FISCAL_MASTER_KEY');

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const store = createSupabaseStore(service);
const emitter = createFiscalEmitter({
  store,
  provider: createDtecoreBlockedProvider(),
  masterKey: MASTER_KEY,
});

async function resolveUser(authHeader: string): Promise<string | null> {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

const handle = createHttpHandler({ emitter, resolveUser });

Deno.serve(async (req: Request): Promise<Response> => {
  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
  }
  const out = await handle({
    method: req.method,
    authHeader: req.headers.get('authorization'),
    body,
  });
  return new Response(JSON.stringify(out.body), {
    status: out.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
});
