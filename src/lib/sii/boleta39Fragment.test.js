import { describe, it, expect } from 'vitest';
import { buildUnsignedBoleta39Fragment, escapeSiiXml } from './boleta39Fragment';

const base = { issuer: { rut: '12345678-5', legalName: 'Comercio & Hijos' }, providerRut: '12345678-5', folio: 1, issueDate: '2026-10-28', paymentMethod: 'cash', items: [{ name: 'Café <grande>', quantity: 2, unitPrice: 1190 }] };

describe('fragmento boleta 39 sin firma ni envío', () => {
  it('calcula montos IVA incluido y escapa caracteres XML', () => {
    const result = buildUnsignedBoleta39Fragment(base);
    expect(result.status).toBe('unsigned_fragment_only');
    expect(result.total).toBe(2380);
    expect(result.net).toBe(2000);
    expect(result.vat).toBe(380);
    expect(result.xmlFragment).toContain('Comercio &amp; Hijos');
    expect(result.xmlFragment).toContain('Café &lt;grande&gt;');
    expect(result.xmlFragment).toContain('<TipoDTE>39</TipoDTE>');
  });
  it('rechaza fechas imposibles, folios no enteros y artículos fuera de alcance', () => {
    expect(() => buildUnsignedBoleta39Fragment({ ...base, issueDate: '2026-02-30' })).toThrow();
    expect(() => buildUnsignedBoleta39Fragment({ ...base, folio: 1.2 })).toThrow();
    expect(() => buildUnsignedBoleta39Fragment({ ...base, items: [{ ...base.items[0], discount: 10 }] })).toThrow();
  });
  it('rechaza caracteres XML prohibidos', () => {
    expect(() => escapeSiiXml('hola\u0001', 80)).toThrow();
  });
});
