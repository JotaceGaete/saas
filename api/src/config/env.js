import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_PAYPAL_MODES = new Set(['sandbox', 'live']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const API_ROOT = resolve(__dirname, '../..');
const PROJECT_ROOT = resolve(API_ROOT, '..');

let dotenvLoaded = false;

let cachedEnv = null;

function normalizeMode(rawMode) {
  const mode = String(rawMode || '').trim().toLowerCase();
  return VALID_PAYPAL_MODES.has(mode) ? mode : null;
}

function assertRequired(value, name, errors) {
  if (!value || !String(value).trim()) {
    errors.push(`Missing required env var: ${name}`);
  }
}

/**
 * Valida y devuelve variables de entorno del backend.
 * Mantiene cache para no recalcular en cada request.
 */
export function getEnv() {
  if (cachedEnv) return cachedEnv;
  if (!dotenvLoaded) {
    // Fallback .env: no sobreescribe variables ya definidas en el proceso (PowerShell/CI).
    dotenv.config({ path: resolve(PROJECT_ROOT, '.env'), override: false });
    dotenv.config({ path: resolve(API_ROOT, '.env'), override: false });
    dotenvLoaded = true;
  }

  const errors = [];
  const paypalMode = normalizeMode(process.env.PAYPAL_MODE);
  const paypalClientId = process.env.PAYPAL_CLIENT_ID;
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

  assertRequired(paypalClientId, 'PAYPAL_CLIENT_ID', errors);
  assertRequired(paypalClientSecret, 'PAYPAL_CLIENT_SECRET', errors);
  assertRequired(process.env.PAYPAL_MODE, 'PAYPAL_MODE', errors);

  if (!paypalMode) {
    errors.push('Invalid PAYPAL_MODE. Allowed values: sandbox | live');
  }

  if (errors.length > 0) {
    throw new Error(`[env] Configuration error(s): ${errors.join(' | ')}`);
  }

  cachedEnv = Object.freeze({
    nodeEnv: process.env.NODE_ENV || 'development',
    paypal: Object.freeze({
      mode: paypalMode,
      clientId: String(paypalClientId).trim(),
      clientSecret: String(paypalClientSecret).trim(),
    }),
  });

  return cachedEnv;
}

/**
 * Útil para tests o reinicialización explícita.
 */
export function clearEnvCache() {
  cachedEnv = null;
}

