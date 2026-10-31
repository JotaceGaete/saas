// Server-to-server sweep: registers confirmed Point sales that lack a fiscal
// ledger row as PENDING. It never emits. Trigger from a trusted scheduler only.
import { createClient } from '@supabase/supabase-js';
import { createPointFiscalSweeper, createPointSweepCandidateLister } from '../_lib/siisolutions-sweep.js';
import { verifyPointSaleForFiscal } from '../_lib/siisolutions-point-verification.js';
import { createPointFiscalSaleLoader } from '../_lib/siisolutions-point-sale-loader.js';
import { createFiscalPointConnectionLoader, createFiscalPointOrderFetcher } from '../_lib/siisolutions-point-provider.js';
import { createFiscalIssuanceRepository } from '../_lib/siisolutions-repository.js';
import { secretsMatch } from './emit-point.js';

export function createSweepHandler({ internalSecret, runSweep }) {
  if (typeof runSweep !== 'function') throw new Error('Sweep runner required');
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
    const limit = Number(req.body?.limit ?? 50);
    try {
      const report = await runSweep({ limit });
      return res.status(200).json({ report });
    } catch {
      return res.status(503).json({ error: 'SWEEP_UNAVAILABLE' });
    }
  };
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const loadConnection = createFiscalPointConnectionLoader(admin);
  const fetchProviderOrder = createFiscalPointOrderFetcher({ loadConnection, fetchImpl: fetch });
  const loadPersisted = createPointFiscalSaleLoader(admin);
  const repository = createFiscalIssuanceRepository(admin);
  // Note: the sweeper receives NO emission dependency by construction.
  const sweep = createPointFiscalSweeper({
    listCandidates: createPointSweepCandidateLister(admin),
    verifySale: ({ businessId, invoiceId }) => verifyPointSaleForFiscal({
      invoiceId, businessId, loadPersisted, fetchProviderOrder,
    }),
    registerPending: repository.registerPending,
  });
  return createSweepHandler({
    internalSecret: process.env.FISCAL_INTERNAL_SECRET,
    runSweep: sweep,
  })(req, res);
}
