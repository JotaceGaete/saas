import { createHash } from 'node:crypto';

const LOOPS_SEND_EVENT_URL = 'https://app.loops.so/api/v1/events/send';
const SUPPORTED_EVENTS = new Set(['user_registered', 'first_product_created']);

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

function buildTestDeliveredEmail(testEmail, originalEmail) {
  const normalizedTestEmail = normalizeEmail(testEmail);
  const match = normalizedTestEmail.match(/^([^@+]+)(?:\+[^@]*)?@(gmail\.com|googlemail\.com)$/i);
  if (!match) return normalizedTestEmail;
  const localPart = match[1];
  const domain = match[2].toLowerCase();
  const hash = getEmailHash(originalEmail).slice(0, 10);
  return `${localPart}+walinka-test-${hash}@${domain}`;
}

function getRuntimeLabel(env) {
  return {
    vercelEnv: String(env.VERCEL_ENV || '').trim() || null,
    appEnv: String(env.APP_ENV || '').trim() || null,
    nodeEnv: String(env.NODE_ENV || '').trim() || null,
    runtimeEnv: String(env.RUNTIME_ENV || '').trim() || null,
    loopsTestModeEnv: String(env.LOOPS_TEST_MODE || '').trim() || null,
  };
}

function isLoopsTestModeEnabled(env) {
  return String(env.LOOPS_TEST_MODE || '')
    .trim()
    .toLowerCase() === 'true';
}

function getMode(env) {
  if (env.LOOPS_ENABLED !== 'true') return 'disabled';
  if (isLoopsTestModeEnabled(env)) return 'test';
  return 'production';
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return null;
  const visibleLocal = localPart.length <= 2 ? `${localPart[0] || ''}*` : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  const [domainName, ...domainRest] = domain.split('.');
  const visibleDomain =
    domainName.length <= 2 ? `${domainName[0] || ''}*` : `${domainName.slice(0, 2)}***${domainName.slice(-1)}`;
  return `${visibleLocal}@${visibleDomain}${domainRest.length ? `.${domainRest.join('.')}` : ''}`;
}

function safeLog(level, message, { eventName, mode, skippedReason, emailHash, originalEmail, finalEmail, testMode, runtime, status } = {}) {
  const logger = level === 'warn' ? console.warn : console.log;
  logger(message, {
    source: 'api/loops/event.js',
    eventName: eventName || null,
    mode: mode || null,
    skippedReason: skippedReason || null,
    emailHash: emailHash || null,
    originalEmail: maskEmail(originalEmail),
    finalEmail: maskEmail(finalEmail),
    testMode: Boolean(testMode),
    runtime: runtime || null,
    timestamp: new Date().toISOString(),
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
      businessId: pickString(payload?.businessId, 80),
      productsCount: Number.isFinite(Number(payload?.productsCount)) ? Number(payload.productsCount) : undefined,
      ordersCount: Number.isFinite(Number(payload?.ordersCount)) ? Number(payload.ordersCount) : undefined,
      businessMode: pickString(payload?.businessMode, 80),
      country: pickString(payload?.country, 80),
      plan: pickString(payload?.plan || 'starter', 80),
    },
  };
}

function shouldSendToLoops({ deliveredEmail, allowlistEmail, env, mode }) {
  const allowlist = parseAllowlist(env.LOOPS_ALLOWLIST);
  const isAllowlisted =
    allowlist.size > 0 &&
    (allowlist.has(deliveredEmail) || (allowlistEmail && allowlist.has(allowlistEmail)));
  if (allowlist.size > 0 && !isAllowlisted) {
    return { allowed: false, skippedReason: 'email_not_allowlisted' };
  }

  if (isAllowlisted) {
    return { allowed: true, isAllowlisted };
  }

  if (mode === 'test') {
    return { allowed: true, isAllowlisted: false };
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
  const testMode = isLoopsTestModeEnabled(env);
  const testEmail = normalizeEmail(env.LOOPS_TEST_EMAIL);
  const runtime = getRuntimeLabel(env);
  console.log('[loops] envCheck', {
    LOOPS_TEST_MODE: env.LOOPS_TEST_MODE,
    computedTestMode: testMode,
    mode,
  });
  if (env.LOOPS_ENABLED !== 'true') {
    safeLog('info', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: 'loops_disabled',
      emailHash,
      originalEmail,
      finalEmail: originalEmail,
      testMode,
      runtime,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_disabled' });
  }
  if (testMode && !testEmail) {
    safeLog('warn', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: 'missing_test_email',
      emailHash,
      originalEmail,
      finalEmail: originalEmail,
      testMode,
      runtime,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'missing_test_email' });
  }

  const deliveredEmail = testMode ? buildTestDeliveredEmail(testEmail, originalEmail) : originalEmail;
  const gate = shouldSendToLoops({
    deliveredEmail,
    allowlistEmail: testMode ? testEmail : originalEmail,
    env,
    mode,
  });
  if (!gate.allowed) {
    safeLog('info', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: gate.skippedReason,
      emailHash,
      originalEmail,
      finalEmail: deliveredEmail,
      testMode,
      runtime,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: gate.skippedReason });
  }

  const apiKey = String(env.LOOPS_API_KEY || '').trim();
  if (!apiKey) {
    safeLog('warn', '[loops] event skipped', {
      eventName,
      mode,
      skippedReason: 'missing_api_key',
      emailHash,
      originalEmail,
      finalEmail: deliveredEmail,
      testMode,
      runtime,
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
      safeLog('warn', '[loops] send failed', {
        eventName,
        mode,
        skippedReason: 'loops_error',
        emailHash,
        originalEmail,
        finalEmail: deliveredEmail,
        testMode,
        runtime,
        status: response.status,
      });
      return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_error' });
    }

    safeLog('info', '[loops] event sent', {
      eventName,
      mode,
      emailHash,
      originalEmail,
      finalEmail: deliveredEmail,
      testMode,
      runtime,
    });
    return jsonResponse({ ok: true, sent: true, mode });
  } catch (error) {
    safeLog('warn', '[loops] send exception', {
      eventName,
      mode,
      skippedReason: 'loops_error',
      emailHash,
      originalEmail,
      finalEmail: deliveredEmail,
      testMode,
      runtime,
    });
    return jsonResponse({ ok: true, sent: false, mode, skippedReason: 'loops_error' });
  }
}

export async function GET() {
  return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
}
