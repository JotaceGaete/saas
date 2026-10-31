// Owner-authenticated download of an already issued fiscal document.
// Read-only: never contacts DTECore and never emits or retries a DTE.
import { createClient } from '@supabase/supabase-js';
import { createBusinessOwnerGuard } from '../_lib/siisolutions-owner-guard.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMATS = { pdf: { column: 'pdf_base64', mime: 'application/pdf', magic: '%PDF-' }, xml: { column: 'xml_base64', mime: 'application/xml', magic: '<?xml' } };

export function createFiscalDownloadHandler({ admin, assertOwner }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const { businessId, invoiceId, format } = req.query || {};
    if (!UUID.test(invoiceId || '') || !Object.hasOwn(FORMATS, format)) return res.status(400).json({ error: 'INVALID_REQUEST' });
    const guard = await assertOwner({ bearer: req.headers?.authorization, businessId });
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
    const { data: invoice, error: invoiceError } = await admin.from('crm_invoices')
      .select('id').eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    if (invoiceError) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (!invoice) return res.status(404).json({ error: 'INVOICE_NOT_FOUND' });
    const column = FORMATS[format].column;
    const { data: document, error } = await admin.from('crm_fiscal_issuances')
      .select('status,folio,' + column)
      .eq('business_id', businessId).eq('sale_id', invoiceId).eq('dte_type', 39).eq('provider', 'siisolutions').maybeSingle();
    if (error) return res.status(503).json({ error: 'SERVER_ERROR' });
    if (document?.status !== 'issued' || !Number.isSafeInteger(document?.folio) || document.folio <= 0) return res.status(404).json({ error: 'DOCUMENT_NOT_AVAILABLE' });
    const encoded = document[column];
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return res.status(503).json({ error: 'DOCUMENT_INVALID' });
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || !bytes.subarray(0, 5).toString('utf8').startsWith(FORMATS[format].magic)) return res.status(503).json({ error: 'DOCUMENT_INVALID' });
    res.setHeader('Content-Type', FORMATS[format].mime);
    res.setHeader('Content-Disposition', 'attachment; filename="boleta-' + document.folio + '.' + format + '"');
    return res.status(200).send(bytes);
  };
}

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' }); }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async token => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const assertOwner = createBusinessOwnerGuard({ authenticate, admin });
  return createFiscalDownloadHandler({ admin, assertOwner })(
    { ...req, query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) }, res
  );
}
