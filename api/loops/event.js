import { createHash } from 'node:crypto';

const LOOPS_SEND_EVENT_URL = 'https://app.loops.so/api/v1/events/send';
const SUPPORTED_EVENTS = new Set(['user_registered']);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
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

function getMode(env) {
  if (env.LOOPS_ENABLED !== 'true') return 'disabled';
  if (env.LOOPS_TEST_MODE === 'true') return 'test';
  return 'live';
}

function safeLog(level, message, { eventName, mode, skippedReason, emailHash, status } = {}) {
  const logger = level === 'warn' ? console.warn : console.log;
  logger(message, {
    eventName: eventName || null,
    mode: mode || null,
    skippedReason: skippedReason || null,
    emailHash: emailHash || null,
    status: status || null,
  });
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

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function buildLoopsPayload(eventName, effectiveEmail, payload) {
  return {
    email: effectiveEmail,
    eventName,
    eventProperties: {
      firstName: pickString(payload?.firstName),
      businessName: pickString(payload?.businessName),
      country: pickString(payload?.country, 80),
      plan: pickString(payload?.plan || 'starter', 80),
    },
  };
}

function shouldSendToLoops({ originalEmail, env }) {
  if (env.LOOPS_ENABLED !== 'true') {
    return { allowed: false, skippedReason: 'loops_disabled' };
  }

  const allowlist = parseAllowlist(env.LOOPS_ALLOWLIST);
  const isAllowlisted = allowlist.size > 0 && allowlist.has(originalEmail);
  if (allowlist.size > 0 && !isAllowlisted) {
    return { allowed: false, skippedReason: 'email_not_allowlisted' };
  }

  if (isAllowlisted) {
    return { allowed: true, isAllowlisted };
  }

  const rolloutPercent = parseRolloutPercent(env.LOOPS_ROLLOUT_PERCENT);
  if (rolloutPercent <= 0) {
    return { allowed: false, skippedReason: 'rollout_disabled' };
  }
  if (hashEmailToBucket(originalEmail) >= rolloutPercent) {
    return { allowed: false, skippedReason: 'outside_rollout' };
  }

  return { allowed: true, isAllowlisted: false };
}

export async function POST(request) {
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
  const mode = getMode(env);
  const emailHash = getEmailHash(originalEmail);
  const gate = shouldSendToLoops({ originalEmail, env });
  if (!gate.allowed) {
    safeLog('info', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: gate.skippedReason,
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, skippedReason: gate.skippedReason });
  }

  const apiKey = String(env.LOOPS_API_KEY || '').trim();
  if (!apiKey) {
    safeLog('warn', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: 'missing_api_key',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, skippedReason: 'missing_api_key' });
  }

  const testMode = env.LOOPS_TEST_MODE === 'true';
  const testEmail = normalizeEmail(env.LOOPS_TEST_EMAIL);
  if (testMode && !testEmail) {
    safeLog('warn', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: 'missing_test_email',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, skippedReason: 'missing_test_email' });
  }

  const effectiveEmail = testMode ? testEmail : originalEmail;
  const loopsPayload = buildLoopsPayload(eventName, effectiveEmail, payload);

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
      safeLog('warn', '[loops] send failed', {
        eventName,
        mode,
        skippedReason: 'loops_error',
        emailHash,
        status: response.status,
      });
      return jsonResponse({ ok: true, sent: false, skippedReason: 'loops_error' });
    }

    safeLog('info', '[loops] event sent', {
      eventName,
      mode,
      emailHash,
    });
    return jsonResponse({ ok: true, sent: true, testMode });
  } catch (error) {
    safeLog('warn', '[loops] send exception', {
      eventName,
      mode,
      skippedReason: 'loops_error',
      emailHash,
    });
    return jsonResponse({ ok: true, sent: false, skippedReason: 'loops_error' });
  }
}

export async function GET() {
  return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
}
