// Supabase Edge Function: emisor fiscal DTE 39. Solo lee el entorno y sirve; la lógica está en app.ts.
//
// ESTADO: el envoltorio se compila y se prueba en Deno (test/deno/app.test.ts). El almacén contra
// PostgREST real NO está verificado. Proveedor: bloqueado por defecto; SII Solutions solo con FISCAL_PROVIDER=siisolutions.
//
// Seguridad:
//  - Requiere Authorization: Bearer <JWT de usuario>; el usuario se resuelve con auth.getUser().
//  - SUPABASE_SERVICE_ROLE_KEY solo vive en el servidor; nunca llega al navegador.
//  - FISCAL_MASTER_KEY (32 bytes base64) cifra las credenciales por comercio.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildFiscalHandler } from './app.ts';
import { createDtecoreBlockedProvider } from './lib/providers/dtecore-blocked.mjs';
import { createSiisolutionsHttpProvider } from './lib/providers/siisolutions-http.mjs';

// Proveedor: bloqueado salvo FISCAL_PROVIDER=dtecore (alias histórico: siisolutions).
// Aun activado, la emisión exige emisor habilitado y verificado, control de emisión global
// encendido, credencial del comercio guardada en el servidor y una venta elegible del día.
// La URL del proveedor es fija (no se lee del entorno ni del cliente).
const providerName = Deno.env.get('FISCAL_PROVIDER') ?? '';
const provider = providerName === 'dtecore' || providerName === 'siisolutions'
  ? createSiisolutionsHttpProvider({ ready: true })
  : createDtecoreBlockedProvider();

const service = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const handler = buildFiscalHandler({
  db: service as any,
  provider,
  masterKey: Deno.env.get('FISCAL_MASTER_KEY'),
});

Deno.serve(handler);
