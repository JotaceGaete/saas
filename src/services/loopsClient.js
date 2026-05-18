const SUPPORTED_LOOPS_EVENTS = new Set(['user_registered', 'first_product_created']);

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function maskEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return null;
  const visibleLocal = localPart.length <= 2 ? `${localPart[0] || ''}*` : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  const [domainName, ...domainRest] = domain.split('.');
  const visibleDomain =
    domainName.length <= 2 ? `${domainName[0] || ''}*` : `${domainName.slice(0, 2)}***${domainName.slice(-1)}`;
  return `${visibleLocal}@${visibleDomain}${domainRest.length ? `.${domainRest.join('.')}` : ''}`;
}

/**
 * Sends an internal event signal to the serverless Loops bridge.
 * This client never talks to Loops directly and never has access to LOOPS_API_KEY.
 *
 * @param {'user_registered'|'first_product_created'} eventName
 * @param {{ email?: string, firstName?: string, businessName?: string, businessId?: string, productsCount?: number, ordersCount?: number, businessMode?: string, country?: string, plan?: string }} payload
 * @returns {Promise<{ ok: boolean, skipped?: boolean }>}
 */
export async function trackLoopsEvent(eventName, payload = {}) {
  if (!SUPPORTED_LOOPS_EVENTS.has(eventName)) {
    return { ok: false, skipped: true };
  }

  try {
    console.info('[loops-client] event dispatch', {
      source: 'src/services/loopsClient.js',
      eventName,
      originalEmail: maskEmail(payload.email),
      finalEmail: maskEmail(payload.email),
      testMode: false,
      runtime: {
        mode: import.meta.env?.MODE || null,
        dev: Boolean(import.meta.env?.DEV),
        prod: Boolean(import.meta.env?.PROD),
      },
      timestamp: new Date().toISOString(),
    });
    const response = await fetch('/api/loops/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        eventName,
        email: pickString(payload.email, 320),
        firstName: pickString(payload.firstName),
        businessName: pickString(payload.businessName),
        businessId: pickString(payload.businessId, 80),
        productsCount: Number.isFinite(Number(payload.productsCount)) ? Number(payload.productsCount) : undefined,
        ordersCount: Number.isFinite(Number(payload.ordersCount)) ? Number(payload.ordersCount) : undefined,
        businessMode: pickString(payload.businessMode, 80),
        country: pickString(payload.country, 80),
        plan: pickString(payload.plan || 'starter', 80),
      }),
    });

    if (!response.ok) return { ok: false };
    return response.json().catch(() => ({ ok: true }));
  } catch {
    return { ok: false };
  }
}
