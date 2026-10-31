import { createClient } from '@supabase/supabase-js';
import { createManualCashFiscalHttpHandler } from './_lib/siisolutions-manual-http.js';
import { createConfiguredManualCashFiscalPilot } from './_lib/siisolutions-manual-cash-pilot.js';

// Server-only endpoint. Never expose service credentials in VITE_ variables.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['simulation', 'live'].includes(process.env.SIISOLUTIONS_EMISSION_ENABLED)) {
    return res.status(503).json({ error: 'FISCAL_EMISSION_NOT_ENABLED' });
  }
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    return res.status(503).json({ error: 'FISCAL_SERVER_NOT_CONFIGURED' });
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async token => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const issueManualCash = createConfiguredManualCashFiscalPilot({
    admin,
    sandboxBaseUrl: process.env.SIISOLUTIONS_EMISSION_ENABLED === 'live' ? 'https://api.siisolutions.cl' : process.env.SIISOLUTIONS_SANDBOX_BASE_URL,
  });
  return createManualCashFiscalHttpHandler({ authenticate, issueManualCash })(req, res);
}
