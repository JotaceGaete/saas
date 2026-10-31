// Authenticated, read-only PDF of a previously issued DTE 39.
import { createClient } from '@supabase/supabase-js';
import { createBusinessOwnerGuard } from '../_lib/siisolutions-owner-guard.js';
import { decodeFiscalPdfForPreview } from '../_lib/siisolutions-pdf-preview.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createFiscalPdfHandler({ admin, assertOwner }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const { businessId, invoiceId } = req.query || {};
    if (!UUID.test(businessId || '') || !UUID.test(invoiceId || '')) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }
    const guard = await assertOwner({ bearer: req.headers?.authorization, businessId });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const { data: invoice, error: invoiceError } = await admin.from('crm_invoices')
      .select('id').eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    if (invoiceError) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (!invoice) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });

    const { data: issuance, error } = await admin.from('crm_fiscal_issuances')
      .select('status,folio,pdf_base64').eq('business_id', businessId)
      .eq('sale_id', invoiceId).eq('dte_type', 39).maybeSingle();
    if (error) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (!issuance) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    const decoded = decodeFiscalPdfForPreview({
      status: issuance.status,
      folio: Number(issuance.folio),
      pdfBase64: issuance.pdf_base64,
    });
    if (!decoded.ready) return res.status(409).json({ error: 'PDF_NOT_AVAILABLE' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="boleta-39-' + decoded.folio + '.pdf"');
    return res.status(200).send(decoded.bytes);
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
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, secret, options);
  const authenticate = async token => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const assertOwner = createBusinessOwnerGuard({ authenticate, admin });
  return createFiscalPdfHandler({ admin, assertOwner })(
    { ...req, query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) },
    res,
  );
}
