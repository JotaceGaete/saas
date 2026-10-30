// Temporary Preview-only SII Solutions connectivity diagnostic.
// No fiscal issuance, no Supabase access, no customer data.
const BASE = 'https://api.siisolutions.cl';
const PATHS = ['/dte/caf/ambiente', '/dte/emisor/estado'];
const ALLOWED_HOST = 'api.siisolutions.cl';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  // Do not expose diagnostic in production, even if accidentally merged.
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const expected = process.env.SIISOLUTIONS_DIAGNOSTIC_TOKEN;
  const provided = req.headers.authorization;
  if (!expected || !provided || provided !== `Bearer ${expected}` || expected.length < 32) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const key = process.env.SII_SOLUTIONS_API_KEY_BONITA_CASUALIDAD;
  if (!key) return res.status(503).json({ error: 'DIAGNOSTIC_API_KEY_NOT_CONFIGURED' });
  const results = [];
  for (const path of PATHS) {
    try {
      const url = new URL(path, BASE);
      if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST) throw new Error('INVALID_TARGET');
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-Api-Key': key, Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(7000),
      });
      // Intentionally do not return response body, headers, or issuer information.
      results.push({ path, status: response.status, reachable: true, authenticated: response.status !== 401 && response.status !== 403, endpointFound: response.status !== 404 });
    } catch (error) {
      results.push({ path, reachable: false, error: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR' });
    }
  }
  return res.status(200).json({ mode: 'preview-readonly', fiscalEmission: false, results });
}
