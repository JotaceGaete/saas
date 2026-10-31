// Read-only fiscal document metadata for an existing CRM invoice.
// This endpoint never issues a DTE or retrieves provider credentials.
import { createClient } from '@supabase/supabase-js';
import { createBusinessOwnerGuard } from '../_lib/siisolutions-owner-guard.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createFiscalDocumentHandler({ admin, assertOwner }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const { businessId, invoiceId } = req.query || {};
    if (!UUID.test(invoiceId || '')) return res.status(400).json({ error: 'INVALID_REQUEST' });
    const guard = await assertOwner({ bearer: req.headers?.authorization, businessId });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

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
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !secret) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const authClient = createClient(url, anon, options);
  const admin = createClient(url, secret, options);
  const authenticate = async token => {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const assertOwner = createBusinessOwnerGuard({ authenticate, admin });
  return createFiscalDocumentHandler({ admin, assertOwner })(
    { ...req, query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) },
    res,
  );
}
