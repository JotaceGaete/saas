// Server-to-server endpoint: called ONLY by trusted Supabase functions after the
// Point sale was finalized. Re-verifies the sale and the Mercado Pago approval
// server-side before any fiscal operation. Simulation-only (see issuer gate).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createConfiguredPointFiscalPilot } from '../_lib/siisolutions-point-pilot.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function secretsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  // Compare HMAC digests so the length of the secret does not leak via timing.
  const digest = value => createHmac('sha256', 'fiscal-internal').update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export function createPointEmissionHandler({ internalSecret, issuePointSale }) {
  if (typeof issuePointSale !== 'function') throw new Error('Point fiscal pilot required');
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    if (!internalSecret) return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
    if (!secretsMatch(req.headers?.['x-fiscal-internal-secret'], internalSecret)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !UUID.test(body.businessId || '') || !UUID.test(body.invoiceId || '')) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }
    try {
      const result = await issuePointSale({ businessId: body.businessId, invoiceId: body.invoiceId });
      if (result?.state === 'blocked') return res.status(403).json({ state: 'blocked', reason: result.reason });
      if (result?.state === 'already_claimed') return res.status(409).json({ state: 'already_claimed' });
      return res.status(200).json({ state: result.state, folio: result.folio ?? null, reason: result.reason ?? null });
    } catch {
      // The provider may have received the request: never retry automatically.
      return res.status(503).json({ error: 'ISSUANCE_OUTCOME_REQUIRES_REVIEW' });
    }
  };
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const issuePointSale = createConfiguredPointFiscalPilot({
    admin, sandboxBaseUrl: process.env.SIISOLUTIONS_EMISSION_ENABLED === 'live' ? 'https://api.siisolutions.cl' : process.env.SIISOLUTIONS_SANDBOX_BASE_URL,
  });
  return createPointEmissionHandler({
    internalSecret: process.env.FISCAL_INTERNAL_SECRET,
    issuePointSale,
  })(req, res);
}
