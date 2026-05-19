import { createHash } from 'node:crypto';

const N8N_LOOPS_WEBHOOK_URL = 'https://n8n.jotace.uk/webhook/loops-event';
const ENDPOINT_VERSION = 'n8n-bridge-v1';
const SUPPORTED_EVENTS = new Set(['user_registered', 'first_product_created']);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify({
    ...body,
    endpointVersion: ENDPOINT_VERSION,
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

function getEmailHash(email) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function buildTestDeliveredEmail(testEmail, originalEmail) {
  const normalizedTestEmail = normalizeEmail(testEmail);
  const match = normalizedTestEmail.match(/^([^@+]+)(?:\+[^@]*)?@(gmail\.com|googlemail\.com)$/i);
  if (!match) return normalizedTestEmail;
  const localPart = match[1];
  const domain = match[2].toLowerCase();
  const hash = getEmailHash(originalEmail).slice(0, 10);
  return `${localPart}+walinka-test-${hash}@${domain}`;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, sent: false, error: 'invalid_json' }, 400);
  }

  const eventName = pickString(payload?.eventName, 80);
  if (!eventName || !SUPPORTED_EVENTS.has(eventName)) {
    return jsonResponse({ ok: false, sent: false, error: 'unsupported_event' }, 400);
  }

  const originalEmail = normalizeEmail(payload?.email);
  if (!originalEmail || !isValidEmail(originalEmail)) {
    return jsonResponse({ ok: false, sent: false, error: 'invalid_email' }, 400);
  }

  const testMode = process.env.LOOPS_TEST_MODE === 'true';
  const testEmail = normalizeEmail(process.env.LOOPS_TEST_EMAIL || '');

  const deliveredEmail =
    testMode && testEmail ? buildTestDeliveredEmail(testEmail, originalEmail) : originalEmail;

  const n8nPayload = {
    eventName,
    email: deliveredEmail,
    firstName: pickString(payload?.firstName),
    businessName: pickString(payload?.businessName),
    country: pickString(payload?.country, 80),
    plan: pickString(payload?.plan || 'starter', 80),
  };

  try {
    const response = await fetch(N8N_LOOPS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
    });

    if (!response.ok) {
      return jsonResponse({ ok: true, sent: false, skippedReason: 'n8n_error' });
    }

    return jsonResponse({ ok: true, sent: true });
  } catch {
    return jsonResponse({ ok: true, sent: false, skippedReason: 'n8n_error' });
  }
}

export async function GET() {
  return jsonResponse({ ok: true });
}
