const LOOPS_SEND_EVENT_URL = 'https://app.loops.so/api/v1/events/send';
const ENDPOINT_VERSION = 'loops-hard-reset';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify({
    ...body,
    endpointVersion: ENDPOINT_VERSION,
    mode: 'production',
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, sent: false, error: 'invalid_json' }, 400);
  }

  const eventName = pickString(payload?.eventName, 80);
  if (!eventName) {
    return jsonResponse({ ok: false, sent: false, error: 'missing_event_name' }, 400);
  }

  const email = normalizeEmail(payload?.email);
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ ok: false, sent: false, error: 'invalid_email' }, 400);
  }

  if (process.env.LOOPS_ENABLED !== 'true') {
    return jsonResponse({ ok: true, sent: false, skippedReason: 'loops_disabled' });
  }

  const apiKey = String(process.env.LOOPS_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse({ ok: true, sent: false, skippedReason: 'missing_api_key' });
  }

  const loopsPayload = {
    email,
    eventName,
    eventProperties: {
      firstName: pickString(payload?.firstName),
      businessName: pickString(payload?.businessName),
      country: pickString(payload?.country, 80),
      plan: pickString(payload?.plan || 'starter', 80),
    },
  };

  try {
    const response = await fetch(LOOPS_SEND_EVENT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loopsPayload),
    });

    if (!response.ok) {
      return jsonResponse({ ok: true, sent: false, skippedReason: 'loops_error' });
    }

    return jsonResponse({ ok: true, sent: true });
  } catch {
    return jsonResponse({ ok: true, sent: false, skippedReason: 'loops_error' });
  }
}

export async function GET() {
  return jsonResponse({ ok: true });
}
