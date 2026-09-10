/**
 * posTerminalDraftStorage.js — tests reales (ejecutables, no source-scan).
 * localStorage está disponible en el entorno jsdom de Vitest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POS_TERMINAL_DRAFT_SCHEMA_VERSION,
  buildPosTerminalDraftKey,
  sanitizePosTerminalDraft,
  readPosTerminalDraft,
  writePosTerminalDraft,
  removePosTerminalDraft,
  buildPosTerminalDraftSnapshot,
  isDraftFromToday,
} from './posTerminalDraftStorage';

beforeEach(() => {
  window.localStorage.clear();
});

const validItem = { _key: 'p1', product_id: 'p1', name: 'Producto A', unit_price: 1000, quantity: 2, note: null };
const validPayment = { id: 'payment_1', method: 'cash', amount: '2000' };

describe('buildPosTerminalDraftKey', () => {
  it('genera una key namespaced por businessId', () => {
    expect(buildPosTerminalDraftKey('biz1')).toBe('pos-terminal-draft:biz1');
  });

  it('businessId distinto produce una key distinta', () => {
    expect(buildPosTerminalDraftKey('biz1')).not.toBe(buildPosTerminalDraftKey('biz2'));
  });

  it('devuelve null si no hay businessId', () => {
    expect(buildPosTerminalDraftKey(null)).toBeNull();
    expect(buildPosTerminalDraftKey('')).toBeNull();
    expect(buildPosTerminalDraftKey(undefined)).toBeNull();
  });
});

describe('write → read round-trip', () => {
  it('preserva cart, idempotencyKey y demás campos a través de write+read', () => {
    const key = buildPosTerminalDraftKey('biz1');
    const snapshot = buildPosTerminalDraftSnapshot({
      cart: [validItem],
      customerId: 'cust1',
      discount: '500',
      notes: 'nota',
      payments: [validPayment],
      idempotencyKey: 'sale-key-1',
    });
    expect(writePosTerminalDraft(key, snapshot)).toBe(true);

    const read = readPosTerminalDraft(key);
    expect(read).not.toBeNull();
    expect(read.idempotencyKey).toBe('sale-key-1');
    expect(read.cart).toEqual([validItem]);
    expect(read.customerId).toBe('cust1');
    expect(read.discount).toBe('500');
    expect(read.notes).toBe('nota');
    expect(read.payments).toEqual([validPayment]);
    expect(read.schemaVersion).toBe(POS_TERMINAL_DRAFT_SCHEMA_VERSION);
  });

  it('businessId distinto no colisiona -- cada key tiene su propio borrador', () => {
    const key1 = buildPosTerminalDraftKey('biz1');
    const key2 = buildPosTerminalDraftKey('biz2');
    writePosTerminalDraft(key1, buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'k1' }));
    expect(readPosTerminalDraft(key2)).toBeNull();
    expect(readPosTerminalDraft(key1)?.idempotencyKey).toBe('k1');
  });
});

describe('clear (removePosTerminalDraft)', () => {
  it('borra el draft -- una lectura posterior devuelve null', () => {
    const key = buildPosTerminalDraftKey('biz1');
    writePosTerminalDraft(key, buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'k1' }));
    expect(readPosTerminalDraft(key)).not.toBeNull();
    expect(removePosTerminalDraft(key)).toBe(true);
    expect(readPosTerminalDraft(key)).toBeNull();
  });

  it('devuelve false sin lanzar si la key es null', () => {
    expect(removePosTerminalDraft(null)).toBe(false);
  });
});

describe('sanitizePosTerminalDraft — schemaVersion inválido', () => {
  it('rechaza un schemaVersion distinto al actual', () => {
    expect(sanitizePosTerminalDraft({ schemaVersion: 999, cart: [validItem], idempotencyKey: 'k1', savedAt: Date.now() })).toBeNull();
  });

  it('rechaza objetos sin schemaVersion', () => {
    expect(sanitizePosTerminalDraft({ cart: [validItem] })).toBeNull();
  });

  it('rechaza null/undefined/no-objeto', () => {
    expect(sanitizePosTerminalDraft(null)).toBeNull();
    expect(sanitizePosTerminalDraft(undefined)).toBeNull();
    expect(sanitizePosTerminalDraft('a string')).toBeNull();
    expect(sanitizePosTerminalDraft(42)).toBeNull();
  });
});

describe('sanitizePosTerminalDraft — snapshot corrupto / shape inesperado', () => {
  const base = { schemaVersion: POS_TERMINAL_DRAFT_SCHEMA_VERSION, idempotencyKey: 'k1', savedAt: Date.now() };

  it('rechaza cart vacío -- un borrador sin ítems no es útil de restaurar', () => {
    expect(sanitizePosTerminalDraft({ ...base, cart: [] })).toBeNull();
  });

  it('rechaza si falta idempotencyKey -- no hay forma segura de reenviar sin duplicar', () => {
    expect(sanitizePosTerminalDraft({ schemaVersion: POS_TERMINAL_DRAFT_SCHEMA_VERSION, cart: [validItem], savedAt: Date.now() })).toBeNull();
  });

  it('rechaza si falta savedAt', () => {
    expect(sanitizePosTerminalDraft({ schemaVersion: POS_TERMINAL_DRAFT_SCHEMA_VERSION, cart: [validItem], idempotencyKey: 'k1' })).toBeNull();
  });

  it('filtra ítems de cart con forma inválida (sin tirar todo el draft si al menos un ítem queda válido)', () => {
    const result = sanitizePosTerminalDraft({
      ...base,
      cart: [validItem, { name: '' }, null, { _key: 'bad', name: 'x', unit_price: -5, quantity: 1 }, 'garbage'],
    });
    expect(result).not.toBeNull();
    expect(result.cart).toEqual([validItem]);
  });

  it('filtra payments con forma inválida', () => {
    const result = sanitizePosTerminalDraft({
      ...base,
      cart: [validItem],
      payments: [validPayment, { id: 'p2' }, null, 'garbage'],
    });
    expect(result.payments).toEqual([validPayment]);
  });

  it('normaliza customerId/discount/notes ausentes a string vacío', () => {
    const result = sanitizePosTerminalDraft({ ...base, cart: [validItem] });
    expect(result.customerId).toBe('');
    expect(result.discount).toBe('');
    expect(result.notes).toBe('');
  });

  it('un objeto JSON arbitrario (no relacionado) nunca lanza -- devuelve null', () => {
    expect(() => sanitizePosTerminalDraft({ foo: 'bar', nested: { a: [1, 2, 3] } })).not.toThrow();
    expect(sanitizePosTerminalDraft({ foo: 'bar', nested: { a: [1, 2, 3] } })).toBeNull();
  });
});

describe('readPosTerminalDraft — JSON corrupto y purga automática', () => {
  it('JSON malformado en localStorage no lanza -- devuelve null y purga la entrada', () => {
    const key = buildPosTerminalDraftKey('biz1');
    window.localStorage.setItem(key, '{not valid json');
    expect(readPosTerminalDraft(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('JSON válido pero con schema inválido se purga tras leerlo', () => {
    const key = buildPosTerminalDraftKey('biz1');
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: 1 }));
    expect(readPosTerminalDraft(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('devuelve null sin tocar storage si no hay key', () => {
    expect(readPosTerminalDraft(null)).toBeNull();
    expect(readPosTerminalDraft('')).toBeNull();
  });
});

describe('excepciones de storage no rompen -- un fallo de storage no debe impedir vender', () => {
  it('writePosTerminalDraft no lanza si localStorage.setItem lanza (ej. cuota excedida)', () => {
    const key = buildPosTerminalDraftKey('biz1');
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => writePosTerminalDraft(key, buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'k1' }))).not.toThrow();
    expect(writePosTerminalDraft(key, buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'k1' }))).toBe(false);
    spy.mockRestore();
  });

  it('readPosTerminalDraft no lanza si localStorage.getItem lanza (ej. modo privado de Safari)', () => {
    const key = buildPosTerminalDraftKey('biz1');
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => readPosTerminalDraft(key)).not.toThrow();
    expect(readPosTerminalDraft(key)).toBeNull();
    spy.mockRestore();
  });

  it('removePosTerminalDraft no lanza si localStorage.removeItem lanza', () => {
    const key = buildPosTerminalDraftKey('biz1');
    const spy = vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => removePosTerminalDraft(key)).not.toThrow();
    expect(removePosTerminalDraft(key)).toBe(false);
    spy.mockRestore();
  });
});

describe('buildPosTerminalDraftSnapshot', () => {
  it('agrega savedAt automáticamente (Date.now())', () => {
    const before = Date.now();
    const snapshot = buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'k1' });
    const after = Date.now();
    expect(snapshot.savedAt).toBeGreaterThanOrEqual(before);
    expect(snapshot.savedAt).toBeLessThanOrEqual(after);
  });

  it('preserva idempotencyKey tal cual', () => {
    const snapshot = buildPosTerminalDraftSnapshot({ cart: [validItem], idempotencyKey: 'sale-abc-123' });
    expect(snapshot.idempotencyKey).toBe('sale-abc-123');
  });

  it('nunca incluye campos de UI ajenos al draft (busy, errorMsg, search, activeCategory)', () => {
    const snapshot = buildPosTerminalDraftSnapshot({
      cart: [validItem],
      idempotencyKey: 'k1',
      busy: true,
      errorMsg: 'boom',
      search: 'texto',
      activeCategory: 'bebidas',
    });
    expect(snapshot).not.toHaveProperty('busy');
    expect(snapshot).not.toHaveProperty('errorMsg');
    expect(snapshot).not.toHaveProperty('search');
    expect(snapshot).not.toHaveProperty('activeCategory');
  });
});

describe('isDraftFromToday', () => {
  it('true si savedAt es hoy (mismo día calendario local)', () => {
    expect(isDraftFromToday(Date.now())).toBe(true);
  });

  it('false si savedAt es de ayer', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    expect(isDraftFromToday(yesterday)).toBe(false);
  });

  it('false si savedAt es inválido', () => {
    expect(isDraftFromToday(null)).toBe(false);
    expect(isDraftFromToday(NaN)).toBe(false);
    expect(isDraftFromToday('not a number')).toBe(false);
  });

  it('respeta el parámetro now explícito para comparar contra una fecha arbitraria', () => {
    const day1 = new Date('2026-01-15T10:00:00').getTime();
    const day1Later = new Date('2026-01-15T22:00:00').getTime();
    const day2 = new Date('2026-01-16T01:00:00').getTime();
    expect(isDraftFromToday(day1, day1Later)).toBe(true);
    expect(isDraftFromToday(day1, day2)).toBe(false);
  });
});
