import { HttpError } from '../../../lib/http/HttpError.js';

function getBaseUrl() {
  return String(process.env.DLOCAL_BASE_URL || '').trim().replace(/\/$/, '');
}

function getApiKey() {
  return String(process.env.DLOCAL_API_KEY || '').trim();
}

function getSecretKey() {
  return String(process.env.DLOCAL_SECRET_KEY || '').trim();
}

function buildAuthorization(apiKey, secretKey) {
  return `Bearer ${apiKey}:${secretKey}`;
}

/**
 * GET /v1/payments/:id — estado real del pago (no confiar solo en el callback).
 */
export async function fetchDlocalPaymentById(paymentId) {
  const id = String(paymentId || '').trim();
  if (!id) {
    throw new HttpError(400, '[dlocal-payment-api] paymentId is required');
  }
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const secretKey = getSecretKey();
  if (!baseUrl || !apiKey || !secretKey) {
    throw new HttpError(503, '[dlocal-payment-api] Missing DLOCAL_BASE_URL/DLOCAL_API_KEY/DLOCAL_SECRET_KEY');
  }
  const url = `${baseUrl}/v1/payments/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthorization(apiKey, secretKey),
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text().catch(() => '');
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    throw new HttpError(502, `[dlocal-payment-api] GET payment failed (${res.status})`, {
      code: 'DLOCAL_PAYMENT_GET_FAILED',
      details: { body: parsed, status: res.status },
    });
  }
  return parsed;
}
