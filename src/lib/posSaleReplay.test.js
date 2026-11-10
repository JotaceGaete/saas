import { describe, it, expect } from 'vitest';
import { isStaleSaleReplay } from './posSaleReplay';

const now = Date.parse('2026-11-10T20:53:27Z');

describe('isStaleSaleReplay', () => {
  it('caso NV-0067: otro total o venta de ayer => no corresponde a este cobro', () => {
    const nv67 = { invoice_number: 67, total: 1000, created_at: '2026-11-09T21:03:35Z' };
    expect(isStaleSaleReplay(nv67, 1500, { now })).toBe(true);
    expect(isStaleSaleReplay(nv67, 1000, { now })).toBe(true); // mismo total, pero de ayer
  });
  it('venta recién creada o reintento reciente del mismo cobro => válida', () => {
    expect(isStaleSaleReplay({ total: 1500, created_at: '2026-11-10T20:53:26Z' }, 1500, { now })).toBe(false);
    expect(isStaleSaleReplay({ total: '1500.00', created_at: '2026-11-10T20:40:00Z' }, 1500, { now })).toBe(false);
    expect(isStaleSaleReplay({ id: 'x', invoice_number: 1 }, 1500, { now })).toBe(false);
    expect(isStaleSaleReplay(null, 1500, { now })).toBe(false);
  });
});
