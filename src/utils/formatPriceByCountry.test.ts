import { describe, it, expect } from 'vitest';
import { formatCatalogPrice, formatPriceByCountry } from './formatPriceByCountry';

describe('formatCatalogPrice (UX por país)', () => {
  it('CO: 40000 → "$ 40.000" sin decimales', () => {
    expect(formatCatalogPrice(40000, 'CO', 'COP')).toBe('$ 40.000');
  });

  it('CL: 5990 → "$ 5.990"', () => {
    expect(formatCatalogPrice(5990, 'CL', 'CLP')).toBe('$ 5.990');
  });

  it('AR: 8990 → "$ 8.990"', () => {
    expect(formatCatalogPrice(8990, 'AR', 'ARS')).toBe('$ 8.990');
  });

  it('US: 49.9 → "$49.90"', () => {
    expect(formatCatalogPrice(49.9, 'US', 'USD')).toMatch(/\$49\.90/);
  });

  it('MX: 199.9 → incluye 199.90 y símbolo $', () => {
    const s = formatCatalogPrice(199.9, 'MX', 'MXN');
    expect(s).toContain('199');
    expect(s).toContain('90');
    expect(s.startsWith('$')).toBe(true);
  });
});

describe('formatPriceByCountry showCurrencyCode', () => {
  it('muestra código ISO en vistas internas', () => {
    const s = formatPriceByCountry(40000, {
      countryCode: 'CO',
      currency: 'COP',
      locale: 'es-CO',
      showCurrencyCode: true,
    });
    expect(s).toMatch(/COP/);
  });
});
