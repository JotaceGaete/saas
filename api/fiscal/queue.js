// Panel queue for fiscal issuance. Owner-only, scoped to the requested business.
// GET  ?businessId=…            → ledger rows (no XML/PDF payloads, no credentials)
// POST {businessId, invoiceId}  → emit a PENDING row only. Unknown/sending/issued/failed → 409.
import { createClient } from '@supabase/supabase-js';
import { createBusinessOwnerGuard } from '../_lib/siisolutions-owner-guard.js';
import { createConfiguredPointFiscalPilot } from '../_lib/siisolutions-point-pilot.js';
import { createConfiguredManualCashFiscalPilot } from '../_lib/siisolutions-manual-cash-pilot.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createQueueHandler({ admin, assertOwner, emitPending }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const bearer = req.headers?.authorization;
    if (req.method === 'GET') {
      const businessId = req.query?.businessId;
      const guard = await assertOwner({ bearer, businessId });
      if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
      const { data: rows, error } = await admin.from('crm_fiscal_issuances')
        .select('sale_id,status,folio,error_code,created_at,updated_at')
        .eq('business_id', businessId).order('created_at', { ascending: false }).limit(100);
      if (error) return res.status(503).json({ error: 'SERVER_ERROR' });
      const saleIds = (rows || []).map(r => r.sale_id);
      const totals = new Map();
      if (saleIds.length) {
        const { data: invoices } = await admin.from('crm_invoices').select('id,total').in('id', saleIds).eq('business_id', businessId);
        for (const inv of invoices || []) totals.set(inv.id, Number(inv.total));
      }
      const items = (rows || []).map(r => ({
        saleId: r.sale_id,
        status: r.status,
        folio: r.folio ?? null,
        reason: r.error_code ?? null,
        total: totals.get(r.sale_id) ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      const counts = items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {});
      return res.status(200).json({ items, counts });
    }
    if (req.method === 'POST') {
      const body = req.body;
      const businessId = body?.businessId;
      const invoiceId = body?.invoiceId;
      if (!UUID.test(invoiceId || '')) return res.status(400).json({ error: 'INVALID_REQUEST' });
      const guard = await assertOwner({ bearer, businessId });
      if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
      const { data: row, error } = await admin.from('crm_fiscal_issuances')
        .select('status').eq('business_id', businessId).eq('sale_id', invoiceId).eq('dte_type', 39).maybeSingle();
      if (error) return res.status(503).json({ error: 'SERVER_ERROR' });
      if (!row) return res.status(404).json({ error: 'NOT_QUEUED' });
      if (row.status !== 'pending') {
        // unknown, sending, issued, failed, cancelled: never re-emitted from the panel.
        return res.status(409).json({ state: 'not_pending', status: row.status });
      }
      try {
        const result = await emitPending({ businessId, invoiceId, actorId: guard.actorId });
        if (result?.state === 'blocked') return res.status(403).json({ state: 'blocked', reason: result.reason });
        if (result?.state === 'already_claimed') return res.status(409).json({ state: 'already_claimed' });
        return res.status(200).json({ state: result.state, folio: result.folio ?? null, reason: result.reason ?? null });
      } catch {
        return res.status(503).json({ error: 'ISSUANCE_OUTCOME_REQUIRES_REVIEW' });
      }
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
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
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async token => {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const sandboxBaseUrl = process.env.SIISOLUTIONS_SANDBOX_BASE_URL;
  const point = createConfiguredPointFiscalPilot({ admin, sandboxBaseUrl });
  const cash = createConfiguredManualCashFiscalPilot({ admin, sandboxBaseUrl });
  const emitPending = async ({ businessId, invoiceId, actorId }) => {
    const { data: rows } = await admin.from('crm_payments').select('payment_method')
      .eq('invoice_id', invoiceId).eq('business_id', businessId).eq('payment_status', 'received');
    const methods = new Set((rows || []).map(r => r.payment_method));
    if (methods.size !== 1) return { state: 'blocked', reason: 'PAYMENT_METHOD_UNSUPPORTED' };
    const [method] = [...methods];
    if (method === 'mercado_pago') return point({ businessId, invoiceId });
    if (method === 'cash') return cash({ businessId, invoiceId, actorId });
    return { state: 'blocked', reason: 'PAYMENT_METHOD_UNSUPPORTED' };
  };
  return createQueueHandler({
    admin,
    assertOwner: createBusinessOwnerGuard({ authenticate, admin }),
    emitPending,
  })({ ...req, query: req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams) }, res);
}
