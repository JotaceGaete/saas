import { getEnv } from '../../config/env.js';
import { getPaypalApiBaseUrl } from '../../config/paypal/index.js';
import { getAccessToken } from './authService.js';
import { HttpError } from '../../lib/http/HttpError.js';

export class WebhookVerificationError extends HttpError {
  constructor(message) {
    super(400, message);
    this.name = 'WebhookVerificationError';
  }
}

export class WebhookInfrastructureError extends HttpError {
  constructor(message, statusCode = 503) {
    super(statusCode, message);
    this.name = 'WebhookInfrastructureError';
  }
}

function readHeader(headers, name) {
  const direct = headers.get(name);
  if (direct) return direct;
  return headers.get(name.toLowerCase());
}

function getWebhookIdFromEnv() {
  const value = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!value) {
    throw new WebhookInfrastructureError('[paypal-webhook] Missing required env var: PAYPAL_WEBHOOK_ID', 503);
  }
  return value;
}

export async function verifyWebhookSignature({ headers, rawBody }) {
  // Fuerza carga/validación base de env (mode/client credentials).
  getEnv();

  const webhookId = getWebhookIdFromEnv();
  const transmissionId = readHeader(headers, 'paypal-transmission-id');
  const transmissionTime = readHeader(headers, 'paypal-transmission-time');
  const certUrl = readHeader(headers, 'paypal-cert-url');
  const authAlgo = readHeader(headers, 'paypal-auth-algo');
  const transmissionSig = readHeader(headers, 'paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    throw new WebhookVerificationError('missing_signature_headers');
  }

  let webhookEvent;
  try {
    webhookEvent = JSON.parse(rawBody);
  } catch {
    throw new WebhookVerificationError('invalid_json');
  }

  const { accessToken } = await getAccessToken();
  const response = await fetch(`${getPaypalApiBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new WebhookInfrastructureError(`paypal_verify_failed_${response.status}: ${text || 'no_details'}`, 502);
  }

  const body = await response.json().catch(() => ({}));
  const verificationStatus = String(body?.verification_status || '').toUpperCase();
  if (verificationStatus !== 'SUCCESS') {
    throw new WebhookVerificationError(verificationStatus || 'verification_failed');
  }

  return { verified: true, event: webhookEvent };
}

