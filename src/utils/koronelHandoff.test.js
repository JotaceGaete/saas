import { describe, expect, it, beforeEach } from 'vitest';
import {
  parseKoronelParams,
  captureKoronelHandoff,
  getKoronelHandoff,
  clearKoronelHandoff,
} from './koronelHandoff';

/** Storage en memoria — evita depender de jsdom/sessionStorage real. */
function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('parseKoronelParams', () => {
  it('returns null when source is not koronel', () => {
    expect(parseKoronelParams('?source=other&koronel_business_id=abc')).toBeNull();
    expect(parseKoronelParams('')).toBeNull();
    expect(parseKoronelParams(undefined)).toBeNull();
  });

  it('returns null when koronel_business_id is missing', () => {
    expect(parseKoronelParams('?source=koronel')).toBeNull();
  });

  it('extracts required and optional fields when handoff is valid', () => {
    const search = '?source=koronel&koronel_business_id=biz-123&name=Panader%C3%ADa+Lucia&whatsapp=%2B56912345678&city=Santiago';
    expect(parseKoronelParams(search)).toEqual({
      source: 'koronel',
      koronelBusinessId: 'biz-123',
      name: 'Panadería Lucia',
      whatsapp: '+56912345678',
      city: 'Santiago',
    });
  });

  it('ignores optional fields that are absent', () => {
    const parsed = parseKoronelParams('?source=koronel&koronel_business_id=biz-123');
    expect(parsed).toEqual({ source: 'koronel', koronelBusinessId: 'biz-123' });
    expect(parsed).not.toHaveProperty('name');
    expect(parsed).not.toHaveProperty('address');
  });
});

describe('captureKoronelHandoff / getKoronelHandoff / clearKoronelHandoff', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('persists a valid handoff and makes it retrievable', () => {
    const captured = captureKoronelHandoff(
      '?source=koronel&koronel_business_id=biz-123&name=Tienda',
      storage
    );
    expect(captured).toEqual({ source: 'koronel', koronelBusinessId: 'biz-123', name: 'Tienda' });
    expect(getKoronelHandoff(storage)).toEqual({
      source: 'koronel',
      koronelBusinessId: 'biz-123',
      name: 'Tienda',
    });
  });

  it('does not persist anything when the query string has no koronel handoff', () => {
    const captured = captureKoronelHandoff('?utm_source=facebook', storage);
    expect(captured).toBeNull();
    expect(getKoronelHandoff(storage)).toBeNull();
  });

  it('returns null when nothing was ever captured', () => {
    expect(getKoronelHandoff(storage)).toBeNull();
  });

  it('clears the stored handoff', () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-123', storage);
    expect(getKoronelHandoff(storage)).not.toBeNull();
    clearKoronelHandoff(storage);
    expect(getKoronelHandoff(storage)).toBeNull();
  });

  it('survives a simulated full-page redirect (same storage instance, new "load")', () => {
    // Simula: llegada desde Koronel -> captura -> ... -> OAuth roundtrip -> nueva carga de página
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-999&whatsapp=%2B56911112222', storage);

    // "Nueva carga de página": ya no hay query string, solo queda el storage persistido.
    const afterRedirect = getKoronelHandoff(storage);
    expect(afterRedirect).toEqual({
      source: 'koronel',
      koronelBusinessId: 'biz-999',
      whatsapp: '+56911112222',
    });
  });

  it('returns null when the stored value is corrupted JSON', () => {
    storage.setItem('walinka_koronel_handoff_v1', '{not-json');
    expect(getKoronelHandoff(storage)).toBeNull();
  });
});
