// Internal-only recovery HTTP adapter. No provider, no user JWT, no public fiscal action.
// Do not deploy or schedule until the real PostgREST contract has been verified.
const response = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export function createRecoveryHttpHandler({ recovery, secret, enabled = false }) {
  if (!recovery || typeof recovery.recoverStaleSending !== 'function') throw new Error('recovery required');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('recovery secret must be at least 32 characters');
  return async function handle(req) {
    if (!enabled) return response(503, { error: 'RECOVERY_DISABLED' });
    if (req.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });
    const authorization = req.headers.get('authorization') ?? '';
    if (authorization !== `Bearer ${secret}`) return response(401, { error: 'UNAUTHORIZED' });
    try {
      const report = await recovery.recoverStaleSending();
      return response(200, report);
    } catch {
      return response(503, { error: 'RECOVERY_UNAVAILABLE' });
    }
  };
}
