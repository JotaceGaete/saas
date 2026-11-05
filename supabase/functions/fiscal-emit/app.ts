// Cableado del emisor fiscal para Edge Functions. Sin Deno.serve ni variables de entorno aquí:
// así se puede probar con `deno test`. index.ts solo lee el entorno y sirve.
//
// ESTADO: el cableado está probado en Deno con un cliente falso. El almacén contra PostgREST
// real NO está verificado (ver README).

import { createFiscalEmitter } from './lib/emit.mjs';
import { createSupabaseStore } from './lib/store-supabase.mjs';
import { createHttpHandler } from './lib/http.mjs';
import { createRecovery } from './lib/recovery.mjs';
import { readRecoveryConfig } from './lib/config.mjs';
import { EMPTY_ALLOWLIST } from './lib/allowlist.mjs';
import { classifyOrigin, corsHeadersFor } from './lib/cors.mjs';

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
  // Empresas autorizadas (lib/allowlist.mjs). Sin ella, ningún negocio puede emitir ni consultar.
  allowedIssuers?: unknown;
}

export function buildFiscalHandler(deps: FiscalAppDeps) {
  const store = createSupabaseStore(deps.db);
  const emitter = createFiscalEmitter({
    store, provider: deps.provider as any, masterKey: deps.masterKey,
    allowedIssuers: (deps.allowedIssuers ?? EMPTY_ALLOWLIST) as any,
  });
  const resolveUser = async (authHeader: string): Promise<string | null> => {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data, error } = await deps.db.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  };
  const handle = createHttpHandler({ emitter, resolveUser });

  // CORS (lib/cors.mjs): toda respuesta, incluidos los errores, lleva las cabeceras del origen.
  // Un origen no autorizado se rechaza antes de autenticar y sin tocar la base.
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const cors = corsHeadersFor(origin);
    if (classifyOrigin(origin) === 'rejected') return json(403, { error: 'ORIGIN_NOT_ALLOWED' }, cors);
    if (req.method === 'OPTIONS') {
      // Preflight: sin cuerpo, sin autenticación y sin efectos (el navegador no envía el JWT aquí).
      return new Response(null, { status: 204, headers: { ...cors, allow: 'POST, OPTIONS', 'cache-control': 'no-store' } });
    }
    try {
      let body: unknown = null;
      if (req.method === 'POST') {
        try {
          body = await req.json();
        } catch {
          return json(400, { error: 'BAD_REQUEST' }, cors);
        }
      }
      const out = await handle({ method: req.method, authHeader: req.headers.get('authorization'), body });
      return json(out.status, out.body, cors);
    } catch (err) {
      // Fallo inesperado fuera del manejador (p. ej. auth.getUser sin red): código estable, sin detalles.
      console.error('fiscal-emit internal error', (err as { name?: string })?.name ?? 'Error');
      return json(500, { error: 'INTERNAL' }, cors);
    }
  };
}

// Recuperación de filas 'sending' vencidas. Lee FISCAL_STALE_AFTER_MS (por defecto 15 minutos,
// límites 5 min - 24 h). Si el valor es inválido, la función NO arranca: es preferible un fallo
// explícito a una ventana de recuperación silenciosamente equivocada.
// ESTADO: no hay planificador que la ejecute todavía; ver README, "Pendientes".
export function buildRecoveryRunner(deps: { db: FiscalDbClient; env: Record<string, string | undefined> }) {
  const { staleAfterMs, source } = readRecoveryConfig(deps.env);
  const store = createSupabaseStore(deps.db);
  return Object.freeze({ recovery: createRecovery({ store, staleAfterMs }), staleAfterMs, source });
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
