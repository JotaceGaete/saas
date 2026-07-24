import { describe, it, expect, beforeEach } from 'vitest';
import { isSafeReturnPath, saveReturnTo, consumeReturnTo } from './authReturnTo';

describe('isSafeReturnPath', () => {
  it('accepts a plain internal path', () => {
    expect(isSafeReturnPath('/product-management')).toBe(true);
    expect(isSafeReturnPath('/orders')).toBe(true);
    expect(isSafeReturnPath('/proveedores/123')).toBe(true);
  });

  it('accepts an internal path with query string', () => {
    expect(isSafeReturnPath('/customers/abc?tab=orders')).toBe(true);
  });

  it('rejects external URLs', () => {
    expect(isSafeReturnPath('https://otro-dominio.com')).toBe(false);
    expect(isSafeReturnPath('http://otro-dominio.com/login')).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isSafeReturnPath('//otro-dominio.com')).toBe(false);
  });

  it('rejects javascript: pseudo-protocol, with or without a leading slash', () => {
    expect(isSafeReturnPath('/javascript:alert(1)')).toBe(false);
    expect(isSafeReturnPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty, null or non-string values', () => {
    expect(isSafeReturnPath('')).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
    expect(isSafeReturnPath(undefined)).toBe(false);
  });

  it('rejects paths that would loop back into the auth flow', () => {
    expect(isSafeReturnPath('/login')).toBe(false);
    expect(isSafeReturnPath('/auth/callback')).toBe(false);
    expect(isSafeReturnPath('/auth/reset-password')).toBe(false);
  });
});

describe('saveReturnTo / consumeReturnTo', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips a valid internal path', () => {
    saveReturnTo('/product-management');
    expect(consumeReturnTo(null)).toBe('/product-management');
  });

  it('consuming clears the stored value (single use)', () => {
    saveReturnTo('/product-management');
    consumeReturnTo(null);
    expect(consumeReturnTo(null)).toBe(null);
  });

  it('does not store an external URL', () => {
    saveReturnTo('https://evil.com');
    expect(consumeReturnTo(null)).toBe(null);
  });

  it('falls back to the given default when nothing was saved', () => {
    expect(consumeReturnTo('/dashboard')).toBe('/dashboard');
  });

  it('defaults the fallback to null', () => {
    expect(consumeReturnTo()).toBe(null);
  });
});
