import { describe, it, expect } from 'vitest';
import { computeCartTotal, hasHiddenPriceItems } from './cartPricing';

describe('computeCartTotal', () => {
  it('suma normalmente cuando todos los items tienen precio visible', () => {
    const items = [
      { id: 'a', price: 1000, quantity: 2 },
      { id: 'b', price: 500, quantity: 1 },
    ];
    expect(computeCartTotal(items)).toBe(2500);
  });

  it('excluye del total los items marcados "Consultar precio" (showPrice=false)', () => {
    const items = [
      { id: 'a', price: 1000, quantity: 2, showPrice: true },
      { id: 'b', price: 55000, quantity: 1, showPrice: false },
    ];
    expect(computeCartTotal(items)).toBe(2000);
  });

  it('total es 0 cuando todos los items tienen precio oculto', () => {
    const items = [
      { id: 'a', price: 30000, quantity: 1, showPrice: false },
      { id: 'b', price: 10000, quantity: 3, showPrice: false },
    ];
    expect(computeCartTotal(items)).toBe(0);
  });

  it('carrito vacío devuelve 0', () => {
    expect(computeCartTotal([])).toBe(0);
    expect(computeCartTotal(undefined)).toBe(0);
  });
});

describe('hasHiddenPriceItems', () => {
  it('false cuando todos los items tienen precio visible', () => {
    expect(hasHiddenPriceItems([{ id: 'a', showPrice: true }])).toBe(false);
    expect(hasHiddenPriceItems([{ id: 'a' }])).toBe(false);
  });

  it('true cuando al menos un item tiene showPrice=false', () => {
    expect(hasHiddenPriceItems([
      { id: 'a', showPrice: true },
      { id: 'b', showPrice: false },
    ])).toBe(true);
  });

  it('false para carrito vacío', () => {
    expect(hasHiddenPriceItems([])).toBe(false);
  });
});
