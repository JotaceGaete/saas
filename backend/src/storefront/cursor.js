import { createHmac, timingSafeEqual } from 'node:crypto';
import { SORT_MODES } from './sort.js';

/** Cursor keyset firmado HMAC-SHA256 (Storefront v1.2 §5). */
export class InvalidCursorError extends Error {
  constructor() {
    super('INVALID_CURSOR');
    this.name = 'InvalidCursorError';
  }
}

const DEV_SECRET = 'dev-only-cursor-secret-do-not-use-in-prod';

/**
 * Lee el secreto del entorno. En producción es obligatorio (fail-closed).
 * Fuera de producción usa un secreto de desarrollo explícito.
 */
export function cursorSecretFromEnv(env = process.env) {
  const s = env.WALINKA_CURSOR_SECRET;
  if (s && s.length >= 16) return s;
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    throw new Error('WALINKA_CURSOR_SECRET (>= 16 caracteres) requerido en producción');
  }
  return DEV_SECRET;
}

export function createCursorCodec({ secret }) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('El secreto del cursor debe tener al menos 16 caracteres');
  }
  const sign = (body) => createHmac('sha256', secret).update(body).digest('base64url');

  return {
    encode(payload) {
      const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      return `${body}.${sign(body)}`;
    },
    decode(token, expect) {
      if (typeof token !== 'string') throw new InvalidCursorError();
      const dot = token.lastIndexOf('.');
      if (dot <= 0) throw new InvalidCursorError();
      const body = token.slice(0, dot);
      const expected = Buffer.from(sign(body));
      const received = Buffer.from(token.slice(dot + 1));
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new InvalidCursorError();
      }
      let parsed;
      try {
        parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        throw new InvalidCursorError();
      }
      if (
        !parsed || typeof parsed !== 'object' ||
        !SORT_MODES.includes(parsed.sort) ||
        typeof parsed.id !== 'string' ||
        (typeof parsed.key !== 'string' && typeof parsed.key !== 'number') ||
        parsed.sort !== expect.sort ||
        parsed.scope !== expect.scope
      ) {
        throw new InvalidCursorError();
      }
      return parsed;
    },
  };
}
