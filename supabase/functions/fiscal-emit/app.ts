// Cableado del emisor fiscal para Edge Functions. Sin Deno.serve ni variables de entorno aquí:
// así se puede probar con `deno test`. index.ts solo lee el entorno y sirve.
//
// ESTADO: el cableado está probado en Deno con un cliente falso. El almacén contra PostgREST
// real NO está verificado (ver README).

import { createFiscalEmitter } from './lib/emit.mjs';
import { createSupabaseStore } from './lib/store-supabase.mjs';
import { createHttpHandler } from './lib/http.mjs';

// Interfaz mínima de supabase-js que usa la aplicación (compatible con el cliente real).
export interface FiscalDbClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): any;
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
}

export interface FiscalAppDeps {
  db: FiscalDbClient;
  provider: unknown; // adaptador de proveedor (lib/providers/*)
  masterKey: string | undefined;
}

export function buildFiscalHandler(deps: FiscalAppDeps) {
  const store = createSupabaseStore(deps.db);
  const emitter = createFiscalEmitter({ store, provider: deps.provider as any, masterKey: deps.masterKey });
  const resolveUser = async (authHeader: string): Promise<string | null> => {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data, error } = await deps.db.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  };
  const handle = createHttpHandler({ emitter, resolveUser });

  return async (req: Request): Promise<Response> => {
    let body: unknown = null;
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        return json(400, { error: 'BAD_REQUEST' });
      }
    }
    const out = await handle({ method: req.method, authHeader: req.headers.get('authorization'), body });
    return json(out.status, out.body);
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
