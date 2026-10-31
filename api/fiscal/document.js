// Read-only fiscal document metadata for an existing CRM invoice.
// This endpoint never issues a DTE or retrieves provider credentials.
import { createClient } from '@supabase/supabase-js';
import { createBusinessOwnerGuard } from '../_lib/siisolutions-owner-guard.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createFiscalDocumentHandler({ admin, assertOwner, getAuthFailure }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const { businessId, invoiceId } = req.query || {};
    if (!UUID.test(invoiceId || '')) return res.status(400).json({ error: 'INVALID_REQUEST' });
    const guard = await assertOwner({ bearer: req.headers?.authorization, businessId });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.status === 401 ? (getAuthFailure?.() || guard.error) : guard.error });

    const { data: invoice, error: invoiceError } = await admin.from('crm_invoices')
      .select('id,total').eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    if (invoiceError) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (!invoice) return res.status(404).json({ error: 'INVOICE_NOT_FOUND' });

    const { data: document, error } = await admin.from('crm_fiscal_issuances')
      .select('sale_id,status,folio,error_code,created_at,updated_at')
      .eq('business_id', businessId).eq('sale_id', invoiceId).eq('dte_type', 39).maybeSingle();
    if (error) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (!document) return res.status(200).json({ document: null });
    return res.status(200).json({
      document: {
        saleId: document.sale_id,
        dteType: 39,
        status: document.status,
        folio: document.folio ?? null,
        reason: document.error_code ?? null,
        total: Number(invoice.total),
        createdAt: document.created_at,
        updatedAt: document.updated_at,
      },
    });
  };
}

export default async function handler(req, res) {
  // Match the Supabase project used by the browser session, not a possibly stale server URL.
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  // A mismatch is diagnostic only; authorization still requires getUser + owner guard.
  // Never return token contents or Supabase project identifiers to the browser.
  const bearer = req.headers?.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ') && bearer.slice(7).trim() && !/\s/.test(bearer.slice(7))) {
    try {
      const token = bearer.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
      const issuer = typeof payload.iss === 'string' ? payload.iss.trim().replace(/\/+$/, '') : '';
      if (issuer && issuer !== new URL(url).origin + '/auth/v1') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(401).json({ error: 'AUTH_PROJECT_MISMATCH' });
      }
    } catch { /* Invalid tokens are rejected by the standard owner guard. */ }
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  let admin;
  try { admin = createClient(url, secret, options); }
  catch { return res.status(503).json({ error: 'SERVER_CONFIG_INVALID' }); }
  let authFailure = '';
  const authenticate = async token => {
    let data;
    let error;
    try {
      ({ data, error } = await admin.auth.getUser(token));
    } catch {
      authFailure = 'AUTH_PROVIDER_UNAVAILABLE';
      throw new Error('Auth provider unavailable');
    }
    if (error || !data?.user?.id) {
      authFailure = error?.status === 401 || error?.status === 403 ? 'AUTH_TOKEN_REJECTED' : (error ? 'AUTH_PROVIDER_UNAVAILABLE' : 'AUTH_USER_MISSING');
      throw new Error('Invalid session');
    }
    return data.user.id;
  };
  const assertOwner = createBusinessOwnerGuard({ authenticate, admin });
  return createFiscalDocumentHandler({ admin, assertOwner, getAuthFailure: () => authFailure })(
    { ...req, query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) },
    res,
  );
}
