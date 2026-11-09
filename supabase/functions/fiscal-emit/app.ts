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
import { buildKeyring, parseMasterKey, resolveKeyV2 } from './lib/secrets.mjs';

// Interfaz mínima de supabase-js que usa la aplicación (compatible con el cliente real).
export interface FiscalDbClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): any;
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
}

export interface FiscalAppDeps {
  db: FiscalDbClient;
  provider: unknown; // adaptador de proveedor (lib/providers/*)
  masterKey: string | undefined; // FISCAL_MASTER_KEY: versión 1 (obligatoria)
  masterKeyV2?: string; // FISCAL_MASTER_KEY_V2: versión 2 (opcional)
  masterKeyV2Kcv?: string; // FISCAL_MASTER_KEY_V2_KCV: comprobación de la V2 (obligatoria para usarla)
  // Empresas autorizadas (lib/allowlist.mjs). Sin ella, ningún negocio puede emitir ni consultar.
  allowedIssuers?: unknown;
}

export function buildFiscalHandler(deps: FiscalAppDeps) {
  const store = createSupabaseStore(deps.db);
  const emitter = createFiscalEmitter({
    store, provider: deps.provider as any,
    keyring: buildKeyring({ v1: deps.masterKey, v2: deps.masterKeyV2, v2Kcv: deps.masterKeyV2Kcv }),
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

// Variables que la función necesita (solo nombres; nunca se registran valores).
export const REQUIRED_ENV = Object.freeze(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FISCAL_MASTER_KEY', 'FISCAL_ALLOWED_ISSUERS']);

// Diagnóstico de arranque: qué variables tienen valor, sin exponer ninguno. Incluye si
// FISCAL_PROVIDER está definida y el modo de proveedor resultante (bloqueado salvo dtecore|siisolutions).
export function describeFiscalEnv(get: (name: string) => string | undefined) {
  const present = (n: string) => typeof get(n) === 'string' && get(n)!.trim() !== '';
  const provider = get('FISCAL_PROVIDER') ?? '';
  return {
    present: Object.fromEntries(REQUIRED_ENV.map((n) => [n, present(n)])),
    missing: REQUIRED_ENV.filter((n) => !present(n)),
    fiscalProviderSet: present('FISCAL_PROVIDER'),
    providerMode: provider === 'dtecore' || provider === 'siisolutions' ? 'dtecore' : 'blocked',
    // Solo estados: 'ok' | 'missing' | 'invalid' | 'kcv_missing' | 'kcv_mismatch' | 'same_as_v1'.
    masterKeys: describeMasterKeys(get),
  };
}

// Estado de las claves maestras para el registro de arranque. Nunca devuelve valores ni KCV.
export function describeMasterKeys(get: (name: string) => string | undefined) {
  let v1Key: Uint8Array | null = null;
  let v1 = 'missing';
  const raw1 = get('FISCAL_MASTER_KEY');
  if (typeof raw1 === 'string' && raw1.trim() !== '') {
    try { v1Key = parseMasterKey(raw1); v1 = 'ok'; } catch { v1 = 'invalid'; }
  }
  const v2 = resolveKeyV2({ v2: get('FISCAL_MASTER_KEY_V2'), v2Kcv: get('FISCAL_MASTER_KEY_V2_KCV'), v1Key }).status;
  return { v1, v2 };
}

// Manejador de respaldo cuando la configuración es inválida (p. ej. falta FISCAL_MASTER_KEY).
// Falla cerrado sin caer: respeta CORS (preflight y orígenes rechazados) y responde 503
// FISCAL_NOT_CONFIGURED a todo lo demás. No toca la base ni el proveedor.
export function buildUnconfiguredHandler() {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const cors = corsHeadersFor(origin);
    if (classifyOrigin(origin) === 'rejected') return json(403, { error: 'ORIGIN_NOT_ALLOWED' }, cors);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, allow: 'POST, OPTIONS', 'cache-control': 'no-store' } });
    }
    return json(503, { error: 'FISCAL_NOT_CONFIGURED' }, cors);
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
