// Configuración → Facturación electrónica: estado y gestión de la cuenta DTECore del comercio.
// Solo el propietario fiscal (fiscal_owner) del negocio puede leer o cambiar la conexión.
// Ninguna respuesta contiene la API key.
import { createClient } from '@supabase/supabase-js';
import { createFiscalRoleGuard } from '../_lib/siisolutions-fiscal-role-guard.js';
import { createFiscalConnectionService } from '../_lib/fiscal-connection.js';
import { parseMasterKey } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';
import { allowlistFromEnv } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';
import { describeFiscalConnectionConfig, isDiagnosticAllowed } from '../_lib/fiscal-config-diagnostic.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTION_ROLES = Object.freeze(['fiscal_owner']);

export function createFiscalConnectionHandler({ service, assertAccess }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Allow', 'GET, POST');
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

    const { businessId } = req.query || {};
    if (!UUID.test(businessId || '')) return res.status(400).json({ error: 'INVALID_REQUEST' });

    const authorization = req.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.trim()) {
      return res.status(401).json({ error: 'AUTH_HEADER_MISSING' });
    }

    const guard = await assertAccess({ bearer: authorization, businessId });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    let result;
    if (req.method === 'GET') {
      result = await service.status({ businessId });
    } else {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'BAD_REQUEST' });
      if (body.action === 'connect') {
        result = await service.connect({ businessId, actorId: guard.actorId, body });
      } else if (body.action === 'confirm-rut') {
        result = await service.confirmRut({ businessId, actorId: guard.actorId, body });
      } else if (body.action === 'set-tax-default') {
        result = await service.setTaxDefault({ businessId, actorId: guard.actorId, body });
      } else if (body.action === 'submit') {
        result = await service.submit({ businessId, actorId: guard.actorId, body });
      } else if (body.action === 'disconnect') {
        result = await service.disconnect({ businessId, actorId: guard.actorId, body });
      } else {
        return res.status(400).json({ error: 'UNKNOWN_ACTION' });
      }
    }
    return res.status(result.status).json(result.body);
  };
}

export default async function handler(req, res) {
  // DIAGNÓSTICO TEMPORAL (Etapa 3): GET ?diagnostic=config, solo en la Preview de la rama de #123.
  // Solo booleanos y metadatos del despliegue; nunca valores. En cualquier otro entorno se ignora.
  const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  if (req.method === 'GET' && query.diagnostic === 'config' && isDiagnosticAllowed(process.env)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(describeFiscalConnectionConfig(process.env));
  }
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  let masterKey;
  try {
    masterKey = parseMasterKey(process.env.FISCAL_MASTER_KEY);
  } catch {
    // Sin detalles: no revelar si falta o es inválida.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const assertAccess = createFiscalRoleGuard({ authenticate, admin, allowedRoles: CONNECTION_ROLES });
  // Empresas autorizadas: FISCAL_ALLOWED_ISSUERS (servidor). Vacía o inválida = ninguna.
  const allowedIssuers = allowlistFromEnv(process.env);
  if (allowedIssuers.error) console.error('[fiscal/connection] lista de empresas autorizadas no disponible', allowedIssuers.error);
  const service = createFiscalConnectionService({ admin, masterKey, allowedIssuers });
  const parsed = Object.assign(req, { query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
  return createFiscalConnectionHandler({ service, assertAccess })(parsed, res);
}
