// DIAGNÓSTICO TEMPORAL de configuración de /api/fiscal/connection (Etapa 3). Retirar tras usarlo.
//
// Responde solo booleanos y metadatos públicos del despliegue. Nunca valores, longitudes,
// prefijos, sufijos ni fragmentos de secretos. Se desactiva en Production.
//
// Reproduce exactamente las dos comprobaciones que hacen responder SERVER_NOT_CONFIGURED:
//   1. VITE_SUPABASE_URL o SUPABASE_URL, y SUPABASE_SERVICE_ROLE_KEY.
//   2. parseMasterKey(FISCAL_MASTER_KEY): Buffer.from(base64) debe dar 32 bytes.
// Además informa si la clave es base64 canónico (sin espacios, saltos ni otros caracteres), porque
// Buffer.from ignora caracteres no base64 y eso puede ocultar un valor mal pegado.

import { Buffer } from 'node:buffer';
import { parseMasterKey } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';

const CANONICAL_B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const DIAGNOSTIC_BRANCH = 'claude/fiscal-multiempresa-integridad';

const present = (v) => typeof v === 'string' && v.trim() !== '';

export function isDiagnosticAllowed(env = {}) {
  // Nunca en Production. Solo en la Preview de la rama de la PR #123.
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === DIAGNOSTIC_BRANCH;
}

export function describeFiscalConnectionConfig(env = {}) {
  const raw = env.FISCAL_MASTER_KEY;
  const keyPresent = present(raw);
  const canonical = keyPresent && CANONICAL_B64.test(raw);
  let decodesTo32Bytes = false;
  if (canonical) decodesTo32Bytes = Buffer.from(raw, 'base64').length === 32;
  let acceptedByParseMasterKey = false;
  try { parseMasterKey(raw); acceptedByParseMasterKey = true; } catch { acceptedByParseMasterKey = false; }

  const supabaseUrlPresent = present(env.VITE_SUPABASE_URL) || present(env.SUPABASE_URL);
  const serviceRoleKeyPresent = present(env.SUPABASE_SERVICE_ROLE_KEY);

  let serverNotConfiguredBecause = null;
  if (!supabaseUrlPresent || !serviceRoleKeyPresent) serverNotConfiguredBecause = 'SUPABASE_ENV';
  else if (!acceptedByParseMasterKey) serverNotConfiguredBecause = 'FISCAL_MASTER_KEY';

  return {
    diagnostic: 'fiscal-connection-config',
    supabase: { urlPresent: supabaseUrlPresent, serviceRoleKeyPresent },
    fiscalMasterKey: {
      present: keyPresent,
      canonicalBase64: canonical,
      decodesTo32Bytes,
      acceptedByParseMasterKey,
    },
    serverNotConfiguredBecause,
    deployment: {
      vercelEnv: env.VERCEL_ENV ?? null,
      gitBranch: env.VERCEL_GIT_COMMIT_REF ?? null,
      gitCommit: typeof env.VERCEL_GIT_COMMIT_SHA === 'string' ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      isExpectedPreview: isDiagnosticAllowed(env),
    },
  };
}
