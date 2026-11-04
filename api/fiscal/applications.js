// Panel de Walinka → Facturación: cola de altas de facturación electrónica y su revisión.
// Solo administradores de Walinka (app_metadata.role = 'admin'). Ninguna respuesta contiene API keys.
import { createClient } from '@supabase/supabase-js';
import { createFiscalApplicationsService } from '../_lib/fiscal-applications.js';
import { allowlistFromEnv } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

export function createFiscalApplicationsHandler({ service, assertAdmin }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Allow', 'GET, POST');
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

    const authorization = req.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.trim()) {
      return res.status(401).json({ error: 'AUTH_HEADER_MISSING' });
    }
    const guard = await assertAdmin({ bearer: authorization });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    let result;
    if (req.method === 'GET') {
      const status = req.query?.status ? String(req.query.status) : null;
      result = await service.list({ status });
    } else {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'BAD_REQUEST' });
      if (body.action !== 'review') return res.status(400).json({ error: 'UNKNOWN_ACTION' });
      result = await service.review({ adminId: guard.adminId, body });
    }
    return res.status(result.status).json(result.body);
  };
}

/** Guarda: sesión válida y rol admin en app_metadata (no en user_metadata, que el usuario edita). */
export function createAdminGuard({ getUser }) {
  return async function assertAdmin({ bearer }) {
    const token = String(bearer).replace(/^Bearer\s+/i, '').trim();
    if (!token) return { ok: false, status: 401, error: 'AUTH_HEADER_MISSING' };
    let user;
    try {
      user = await getUser(token);
    } catch {
      return { ok: false, status: 401, error: 'INVALID_SESSION' };
    }
    if (!user?.id) return { ok: false, status: 401, error: 'INVALID_SESSION' };
    if (user.app_metadata?.role !== 'admin') return { ok: false, status: 403, error: 'ADMIN_REQUIRED' };
    return { ok: true, adminId: user.id };
  };
}

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const getUser = async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error) throw new Error('Invalid session');
    return data?.user ?? null;
  };
  const allowedIssuers = allowlistFromEnv(process.env);
  if (allowedIssuers.error) console.error('[fiscal/applications] lista de empresas autorizadas no disponible', allowedIssuers.error);
  const service = createFiscalApplicationsService({ admin, allowedIssuers });
  const parsed = Object.assign(req, { query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
  return createFiscalApplicationsHandler({ service, assertAdmin: createAdminGuard({ getUser }) })(parsed, res);
}
