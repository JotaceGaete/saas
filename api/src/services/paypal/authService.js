import { Buffer } from 'node:buffer';
import { getPaypalClientCredentials } from '../../config/paypal/index.js';
import { paypalRequest } from '../../lib/paypal/httpClient.js';

let tokenCache = {
  accessToken: null,
  expiresAtMs: 0,
};

const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 30 * 1000;

function isCachedTokenValid() {
  if (!tokenCache.accessToken) return false;
  return Date.now() < (tokenCache.expiresAtMs - TOKEN_EXPIRY_SAFETY_WINDOW_MS);
}

function buildBasicAuthHeader(clientId, clientSecret) {
  const raw = `${clientId}:${clientSecret}`;
  const encoded = Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Obtiene token OAuth2 de PayPal con cache en memoria.
 * @returns {Promise<{ accessToken: string, tokenType: string, expiresIn: number, source: 'cache'|'paypal' }>}
 */
export async function getAccessToken() {
  if (isCachedTokenValid()) {
    return {
      accessToken: tokenCache.accessToken,
      tokenType: 'Bearer',
      expiresIn: Math.max(0, Math.floor((tokenCache.expiresAtMs - Date.now()) / 1000)),
      source: 'cache',
    };
  }

  const { clientId, clientSecret } = getPaypalClientCredentials();
  const authorization = buildBasicAuthHeader(clientId, clientSecret);

  const response = await paypalRequest('/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const details = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body || {});
    throw new Error(`[paypal-auth] Failed to get token (status ${response.status}): ${details}`);
  }

  const accessToken = response.body?.access_token;
  const tokenType = response.body?.token_type || 'Bearer';
  const expiresIn = Number(response.body?.expires_in || 0);

  if (!accessToken || !expiresIn) {
    throw new Error('[paypal-auth] Invalid token response from PayPal');
  }

  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + (expiresIn * 1000),
  };

  return {
    accessToken,
    tokenType,
    expiresIn,
    source: 'paypal',
  };
}

/**
 * Solo para tests/manual debug.
 */
export function clearPaypalTokenCache() {
  tokenCache = { accessToken: null, expiresAtMs: 0 };
}

