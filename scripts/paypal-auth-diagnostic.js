#!/usr/bin/env node
require('dotenv').config();

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

function getPaypalBaseUrl() {
  return PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function main() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.error('Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET en .env');
    process.exit(1);
  }

  const baseUrl = getPaypalBaseUrl();
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Error autenticando con PayPal');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('Auth OK');
  console.log(JSON.stringify({
    mode: PAYPAL_MODE,
    scope_preview: data.scope?.split(' ').slice(0, 5) || [],
    token_type: data.token_type,
    app_id: data.app_id,
    expires_in: data.expires_in,
    nonce: data.nonce,
  }, null, 2));
}

main().catch((err) => {
  console.error('Fallo inesperado en paypal-auth-diagnostic.js');
  console.error(err);
  process.exit(1);
});