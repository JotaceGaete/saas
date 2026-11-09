// Configuración → Facturación electrónica: estado y gestión de la cuenta DTECore del comercio.
// Solo el propietario fiscal (fiscal_owner) del negocio puede leer o cambiar la conexión.
// Ninguna respuesta contiene la API key.
import { createClient } from '@supabase/supabase-js';
import { createFiscalRoleGuard } from '../_lib/siisolutions-fiscal-role-guard.js';
import { createFiscalConnectionService } from '../_lib/fiscal-connection.js';
import { resolveKeyV2 } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';
import { allowlistFromEnv } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

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
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  // Clave de cifrado de registros nuevos: FISCAL_MASTER_KEY_V2, solo si su KCV coincide con
  // FISCAL_MASTER_KEY_V2_KCV (el mismo valor configurado en Supabase). FISCAL_MASTER_KEY ya no se
  // lee aquí. Sin clave válida solo se bloquea guardar una API key; el resto sigue funcionando.
  // El registro solo informa el estado, nunca valores.
  const v2 = resolveKeyV2({ v2: process.env.FISCAL_MASTER_KEY_V2, v2Kcv: process.env.FISCAL_MASTER_KEY_V2_KCV });
  if (v2.status !== 'ok') console.error('[fiscal/connection] clave de cifrado V2 no disponible', v2.status);
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
  const service = createFiscalConnectionService({ admin, sealingKey: v2.key, allowedIssuers });
  const parsed = Object.assign(req, { query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
  return createFiscalConnectionHandler({ service, assertAccess })(parsed, res);
}
