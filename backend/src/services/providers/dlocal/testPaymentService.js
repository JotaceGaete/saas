import { HttpError } from '../../../lib/http/HttpError.js';

const DEFAULT_ENDPOINT_CANDIDATES = ['/v1/payins', '/v1/payments'];

function getBaseUrl() {
  return String(process.env.DLOCAL_BASE_URL || '').trim().replace(/\/$/, '');
}

function getApiKey() {
  return String(process.env.DLOCAL_API_KEY || '').trim();
}

function getSecretKey() {
  return String(process.env.DLOCAL_SECRET_KEY || '').trim();
}

function sanitizePayloadForLogs(payload) {
  return {
    ...payload,
    payer: payload?.payer
      ? {
        ...payload.payer,
        email: payload.payer.email ? String(payload.payer.email).replace(/(^.).*(@.*$)/, '$1***$2') : undefined,
      }
      : undefined,
  };
}

function maskSecret(value) {
  const raw = String(value || '');
  if (!raw) return 'missing';
  if (raw.length <= 4) return '*'.repeat(raw.length);
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function buildAuthHeader(apiKey, secretKey) {
  // dLocal Go requiere: Authorization: Bearer <API_KEY>:<SECRET_KEY>
  return `Bearer ${apiKey}:${secretKey}`;
}

function buildMinimalPayload({
  amount = 6,
  currency = 'USD',
  country = 'PE',
  orderId,
  email,
  paymentMethodFlow = 'REDIRECT',
}) {
  const order = String(orderId || `ventalink-test-${Date.now()}`).trim();
  return {
    amount: Number(amount),
    currency: String(currency || 'USD').trim().toUpperCase(),
    country: String(country || 'PE').trim().toUpperCase(),
    order_id: order,
    payment_method_flow: String(paymentMethodFlow || 'DIRECT').trim().toUpperCase(),
    payer: {
      name: 'Ventalink Sandbox Test',
      email: String(email || 'qa@ventalink.app').trim().toLowerCase(),
    },
  };
}

async function callDlocal({ endpointPath, payload, apiKey, secretKey, baseUrl }) {
  const url = `${baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(apiKey, secretKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new HttpError(502, `[dlocal-test] upstream request failed: ${err?.message || 'network_error'}`, {
      code: 'DLOCAL_UPSTREAM_REQUEST_FAILED',
      provider: 'dlocal',
      details: { endpointPath },
    });
  }

  const elapsedMs = Date.now() - startedAt;
  const rawText = await response.text().catch(() => '');
  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText || null;
  }
  return {
    endpointPath,
    status: response.status,
    ok: response.ok,
    elapsedMs,
    body: parsed,
  };
}

export async function runDlocalTestPayment({
  amount,
  currency,
  country,
  endpointPath,
  orderId,
  email,
  paymentMethodFlow,
}) {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const secretKey = getSecretKey();
  if (!baseUrl || !apiKey || !secretKey) {
    throw new HttpError(422, '[dlocal-test] Missing DLOCAL_BASE_URL/DLOCAL_API_KEY/DLOCAL_SECRET_KEY', {
      code: 'DLOCAL_TEST_MISSING_CONFIG',
      provider: 'dlocal',
      details: {
        hasBaseUrl: !!baseUrl,
        hasApiKey: !!apiKey,
        hasSecretKey: !!secretKey,
      },
    });
  }

  const payload = buildMinimalPayload({
    amount,
    currency,
    country,
    orderId,
    email,
    paymentMethodFlow,
  });

  const endpointsToTry = endpointPath
    ? [String(endpointPath).trim()]
    : DEFAULT_ENDPOINT_CANDIDATES;

  console.info('[DLOCAL_TEST_AUTH_DEBUG]', {
    baseUrl,
    endpointCandidates: endpointsToTry,
    apiKeyLength: apiKey.length,
    secretKeyLength: secretKey.length,
    apiKeyMasked: maskSecret(apiKey),
    secretKeyMasked: maskSecret(secretKey),
    authorizationMasked: `Bearer ${maskSecret(apiKey)}:${maskSecret(secretKey)}`,
    authFormat: 'Bearer <API_KEY>:<SECRET_KEY>',
  });

  const attempts = [];
  for (const candidate of endpointsToTry) {
    const result = await callDlocal({
      endpointPath: candidate,
      payload,
      apiKey,
      secretKey,
      baseUrl,
    });
    attempts.push(result);
    if (result.status !== 404) {
      console.info('[DLOCAL_TEST_PAYMENT_RESULT]', {
        endpointPath: candidate,
        status: result.status,
        ok: result.ok,
        elapsedMs: result.elapsedMs,
        payload: sanitizePayloadForLogs(payload),
      });
      return {
        ok: result.ok,
        provider: 'dlocal',
        endpointUsed: candidate,
        request: {
          baseUrl,
          endpointPath: candidate,
          payload: sanitizePayloadForLogs(payload),
        },
        upstream: {
          status: result.status,
          body: result.body,
          elapsedMs: result.elapsedMs,
        },
        attempts: attempts.map((item) => ({
          endpointPath: item.endpointPath,
          status: item.status,
          ok: item.ok,
          elapsedMs: item.elapsedMs,
        })),
      };
    }
  }

  throw new HttpError(422, '[dlocal-test] Could not find a valid payment endpoint (all candidates returned 404)', {
    code: 'DLOCAL_ENDPOINT_NOT_FOUND',
    provider: 'dlocal',
    details: {
      candidates: endpointsToTry,
      attempts: attempts.map((item) => ({
        endpointPath: item.endpointPath,
        status: item.status,
      })),
      suggestion: 'Try endpointPath explicitly, e.g. /v1/payins or /v1/payments',
    },
  });
}
