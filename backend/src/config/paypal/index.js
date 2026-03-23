import { getEnv } from '../env.js';
export * from './constants.js';

const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE_URL = 'https://api-m.paypal.com';

export function getPaypalApiBaseUrl() {
  const { paypal } = getEnv();
  return paypal.mode === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL;
}

export function getPaypalClientCredentials() {
  const { paypal } = getEnv();
  return {
    clientId: paypal.clientId,
    clientSecret: paypal.clientSecret,
  };
}

export function getPaypalMode() {
  const { paypal } = getEnv();
  return paypal.mode;
}

