/**
 * Framework-independent HTTP adapter for the manual fiscal simulation.
 * The caller MUST inject a trusted bearer-token verifier and the configured
 * owner-only pilot. Never accept actorId from request JSON.
 */
export function createManualCashFiscalHttpHandler({ authenticate, issueManualCash }) {
  if (typeof authenticate !== 'function' || typeof issueManualCash !== 'function') {
    throw new Error('Trusted authentication and issuer required');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    const bearer = req.headers?.authorization;
    if (typeof bearer !== 'string' || !/^Bearer [^\s]+$/.test(bearer)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    let actorId;
    try {
      actorId = await authenticate(bearer.slice(7));
    } catch {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (!uuid.test(actorId || '')) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !uuid.test(body.businessId || '') || !uuid.test(body.invoiceId || '')) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }
    try {
      const result = await issueManualCash({
        actorId, businessId: body.businessId, invoiceId: body.invoiceId,
      });
      if (result?.state === 'blocked') {
        return res.status(403).json({ state: 'blocked', reason: result.reason });
      }
      if (result?.state === 'already_claimed') {
        return res.status(409).json({ state: 'already_claimed' });
      }
      return res.status(200).json({
        state: result.state,
        folio: result.folio ?? null,
        reason: result.reason ?? null,
      });
    } catch {
      // No automatic retry: the provider may have received the request.
      return res.status(503).json({ error: 'ISSUANCE_OUTCOME_REQUIRES_REVIEW' });
    }
  };
}
