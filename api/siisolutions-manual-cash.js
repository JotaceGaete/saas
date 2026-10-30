import { createClient } from '@supabase/supabase-js';
import { createManualCashFiscalHttpHandler } from './_lib/siisolutions-manual-http.js';
import { createConfiguredManualCashFiscalPilot } from './_lib/siisolutions-manual-cash-pilot.js';

// Server-only endpoint. Never expose service credentials in VITE_ variables.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.SIISOLUTIONS_EMISSION_ENABLED !== 'simulation') {
    return res.status(503).json({ error: 'SIMULATION_NOT_ENABLED' });
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !secret) {
    return res.status(503).json({ error: 'FISCAL_SERVER_NOT_CONFIGURED' });
  }
  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const authenticate = async token => {
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Invalid session');
    return data.user.id;
  };
  const issueManualCash = createConfiguredManualCashFiscalPilot({
    admin,
    sandboxBaseUrl: process.env.SIISOLUTIONS_SANDBOX_BASE_URL,
  });
  return createManualCashFiscalHttpHandler({ authenticate, issueManualCash })(req, res);
}
