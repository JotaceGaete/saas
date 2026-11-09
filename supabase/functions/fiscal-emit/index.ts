// Supabase Edge Function: emisor fiscal DTE 39. Solo lee el entorno y sirve; la lógica está en app.ts.
//
// ESTADO: el envoltorio se compila y se prueba en Deno (test/deno/app.test.ts). El almacén contra
// PostgREST real NO está verificado. Proveedor: bloqueado por defecto; SII Solutions solo con FISCAL_PROVIDER=siisolutions.
//
// Seguridad:
//  - Requiere Authorization: Bearer <JWT de usuario>; el usuario se resuelve con auth.getUser().
//  - SUPABASE_SERVICE_ROLE_KEY solo vive en el servidor; nunca llega al navegador.
//  - FISCAL_MASTER_KEY (32 bytes base64) descifra las credenciales de versión 1.
//  - FISCAL_MASTER_KEY_V2 + FISCAL_MASTER_KEY_V2_KCV (opcionales) descifran las de versión 2.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildFiscalHandler, buildUnconfiguredHandler, describeFiscalEnv } from './app.ts';
import { createDtecoreBlockedProvider } from './lib/providers/dtecore-blocked.mjs';
import { createSiisolutionsHttpProvider } from './lib/providers/siisolutions-http.mjs';
import { ALLOWED_ISSUERS_ENV, parseAllowedIssuers } from './lib/allowlist.mjs';

// Proveedor: bloqueado salvo FISCAL_PROVIDER=dtecore (alias histórico: siisolutions).
// Aun activado, la emisión exige emisor habilitado y verificado, control de emisión global
// encendido, credencial del comercio guardada en el servidor y una venta elegible del día.
// La URL del proveedor es fija (no se lee del entorno ni del cliente).
const providerName = Deno.env.get('FISCAL_PROVIDER') ?? '';
const provider = providerName === 'dtecore' || providerName === 'siisolutions'
  ? createSiisolutionsHttpProvider({ ready: true })
  : createDtecoreBlockedProvider();

// Empresas autorizadas: FISCAL_ALLOWED_ISSUERS="<uuid>=<rut>,...". Vacía o inválida = nadie.
const allowedIssuers = parseAllowedIssuers(Deno.env.get(ALLOWED_ISSUERS_ENV) ?? '');
if (allowedIssuers.error) console.error('fiscal-emit: lista de empresas autorizadas no disponible', allowedIssuers.error);

// Diagnóstico sin valores: qué variables existen y en qué modo queda el proveedor.
const env = describeFiscalEnv((n) => Deno.env.get(n));
console.log('fiscal-emit config', JSON.stringify(env));

// Configuración inválida (p. ej. falta FISCAL_MASTER_KEY): no se cae el proceso. Se sirve un
// manejador que respeta CORS y responde 503 FISCAL_NOT_CONFIGURED, sin base ni proveedor.
let handler: (req: Request) => Promise<Response>;
try {
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  handler = buildFiscalHandler({
    db: service as any,
    provider,
    masterKey: Deno.env.get('FISCAL_MASTER_KEY'),
    masterKeyV2: Deno.env.get('FISCAL_MASTER_KEY_V2'),
    masterKeyV2Kcv: Deno.env.get('FISCAL_MASTER_KEY_V2_KCV'),
    allowedIssuers,
  });
} catch (err) {
  console.error('fiscal-emit: configuración inválida', (err as { code?: string })?.code ?? (err as { name?: string })?.name ?? 'Error');
  handler = buildUnconfiguredHandler();
}

Deno.serve(handler);
