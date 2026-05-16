const SUPPORTED_LOOPS_EVENTS = new Set(['user_registered']);

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Sends an internal event signal to the serverless Loops bridge.
 * This client never talks to Loops directly and never has access to LOOPS_API_KEY.
 *
 * @param {'user_registered'} eventName
 * @param {{ email?: string, firstName?: string, businessName?: string, country?: string, plan?: string }} payload
 * @returns {Promise<{ ok: boolean, skipped?: boolean }>}
 */
export async function trackLoopsEvent(eventName, payload = {}) {
  if (!SUPPORTED_LOOPS_EVENTS.has(eventName)) {
    return { ok: false, skipped: true };
  }

  try {
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
