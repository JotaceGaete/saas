import { createHash } from 'node:crypto';

const LOOPS_SEND_EVENT_URL = 'https://app.loops.so/api/v1/events/send';
const SUPPORTED_EVENTS = new Set(['user_registered', 'first_product_created']);
const ENDPOINT_VERSION = 'loops-v2-clean';

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getEmailHash(email) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 16);
}

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function parseAllowlist(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => normalizeEmail(item))
      .filter(Boolean),
  );
}

function parseRolloutPercent(value) {
  if (value == null || String(value).trim() === '') return 100;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function hashEmailToBucket(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

function shouldSendToLoops({ deliveredEmail, env }) {
  const allowlist = parseAllowlist(env.LOOPS_ALLOWLIST);
  if (allowlist.size > 0 && !allowlist.has(deliveredEmail)) {
    return { allowed: false, skippedReason: 'email_not_allowlisted' };
  }

  if (allowlist.size > 0 && allowlist.has(deliveredEmail)) {
    return { allowed: true, isAllowlisted: true };
  }

  const rolloutPercent = parseRolloutPercent(env.LOOPS_ROLLOUT_PERCENT);
  if (rolloutPercent <= 0) {
    return { allowed: false, skippedReason: 'rollout_disabled' };
  }
  if (hashEmailToBucket(deliveredEmail) >= rolloutPercent) {
    return { allowed: false, skippedReason: 'outside_rollout' };
  }

  return { allowed: true, isAllowlisted: false };
}

function buildLoopsPayload(eventName, deliveredEmail, payload) {
  return {
    email: deliveredEmail,
    eventName,
    eventProperties: {
      firstName: pickString(payload.firstName),
      businessName: pickString(payload.businessName),
      country: pickString(payload.country, 80),
      plan: pickString(payload.plan || 'starter', 80),
    },
  };
}

function safeLog(level, message, context = {}) {
  const logger = level === 'warn' ? console.warn : console.log;
  logger(message, {
    source: 'api/loops/v2-event.js',
    eventName: context.eventName || null,
    mode: 'production',
    skippedReason: context.skippedReason || null,
    emailHash: context.emailHash || null,
    endpointVersion: ENDPOINT_VERSION,
    status: context.status || null,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request) {
  const mode = 'production';

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const eventName = pickString(payload?.eventName, 80);
  if (!SUPPORTED_EVENTS.has(eventName)) {
    return jsonResponse({ ok: false, error: 'unsupported_event' }, 400);
  }

  const originalEmail = normalizeEmail(payload?.email);
  if (!originalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(originalEmail)) {
    return jsonResponse({ ok: false, error: 'invalid_email' }, 400);
  }

  const env = process.env || {};
  const deliveredEmail = originalEmail;
  const emailHash = getEmailHash(originalEmail);

  if (env.LOOPS_ENABLED !== 'true') {
    safeLog('info', '[loops-v2] event skipped', {
      eventName,
      skippedReason: 'loops_disabled',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_disabled' });
  }

  const gate = shouldSendToLoops({ deliveredEmail, env });
  if (!gate.allowed) {
    safeLog('info', '[loops-v2] event skipped', {
      eventName,
      skippedReason: gate.skippedReason,
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: gate.skippedReason });
  }

  const apiKey = String(env.LOOPS_API_KEY || '').trim();
  if (!apiKey) {
    safeLog('warn', '[loops-v2] event skipped', {
      eventName,
      skippedReason: 'missing_api_key',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'missing_api_key' });
  }

  const loopsPayload = buildLoopsPayload(eventName, deliveredEmail, payload);

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
      safeLog('warn', '[loops-v2] send failed', {
        eventName,
        skippedReason: 'loops_error',
        emailHash,
        status: response.status,
      });
      return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_error' });
    }

    safeLog('info', '[loops-v2] event sent', {
      eventName,
      emailHash,
    });
    return jsonResponse({ ok: true, sent: true, mode });
  } catch {
    safeLog('warn', '[loops-v2] send exception', {
      eventName,
      skippedReason: 'loops_error',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_error' });
  }
}
