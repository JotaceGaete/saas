import { describe, it, expect } from 'vitest';
import {
  TAX_TREATMENT, computeTaxBreakdown, dte39TaxBlocker, resolveLineTaxTreatment, isValidTaxTreatment,
} from './taxTreatment';
import { expectedTotals } from '../../../supabase/functions/fiscal-emit/lib/payload.mjs';

const A = TAX_TREATMENT.AFECTO;
const E = TAX_TREATMENT.EXENTO;
const N = TAX_TREATMENT.NO_AFECTO;

describe('desglose con precios con IVA incluido', () => {
  it('reproduce las boletas aceptadas por el SII (51105 y 51106)', () => {
    expect(computeTaxBreakdown([{ gross: 1190, treatment: A }])).toMatchObject({ ok: true, neto: 1000, iva: 190, total: 1190, mntExe: 0 });
    expect(computeTaxBreakdown([{ gross: 100, treatment: A }])).toMatchObject({ ok: true, neto: 84, iva: 16, total: 100 });
  });

  it('redondea sobre el total afecto del documento, no por línea', () => {
    // Tres líneas de $100: por línea serían 84+16 ×3 = 252 + 48; sobre el total, 300/1,19 = 252,1 → 252 + 48.
    const r = computeTaxBreakdown([{ gross: 100, treatment: A }, { gross: 100, treatment: A }, { gross: 100, treatment: A }]);
    expect(r).toMatchObject({ neto: 252, iva: 48, total: 300 });
    // Caso donde por línea y por total difieren: 2 × $5 → por línea round(4,2)=4 ×2 = 8; total round(10/1,19)=8.
    const s = computeTaxBreakdown([{ gross: 5, treatment: A }, { gross: 5, treatment: A }]);
    expect(s.neto + s.iva).toBe(10);
  });

  it('neto + IVA + exento + no afecto = total, siempre', () => {
    for (let total = 1; total <= 5000; total += 37) {
      const r = computeTaxBreakdown([{ gross: total, treatment: A }, { gross: 250, treatment: E }, { gross: 90, treatment: N }]);
      expect(r.neto + r.iva + r.exento + r.noAfecto).toBe(r.total);
      expect(r.mntExe).toBe(340);
    }
  });

  it('coincide con el cálculo del servidor que valida el XML de DTE Core', () => {
    for (const gross of [1, 99, 100, 1190, 2380, 9999, 123457]) {
      const ours = computeTaxBreakdown([{ gross, treatment: A }]);
      const server = expectedTotals({ detalles: [{ precioSubtotal: gross, esExento: false }] });
      expect({ neto: ours.neto, iva: ours.iva, total: ours.total }).toEqual({ neto: server.neto, iva: server.iva, total: server.total });
    }
  });

  it('una línea sin tratamiento o con monto inválido no produce desglose', () => {
    expect(computeTaxBreakdown([{ gross: 100, treatment: null }])).toEqual({ ok: false, code: 'TAX_TREATMENT_MISSING', line: 1 });
    expect(computeTaxBreakdown([{ gross: 10.5, treatment: A }])).toEqual({ ok: false, code: 'INVALID_AMOUNT', line: 1 });
    expect(computeTaxBreakdown([])).toEqual({ ok: false, code: 'NO_LINES' });
  });
});

describe('tratamiento efectivo y emisión', () => {
  it('el producto manda; si no tiene, la categoría por defecto del negocio', () => {
    expect(resolveLineTaxTreatment(E, A)).toBe(E);
    expect(resolveLineTaxTreatment(null, A)).toBe(A);
    expect(resolveLineTaxTreatment(null, null)).toBeNull();
    expect(resolveLineTaxTreatment('IVA_10', null)).toBeNull();
    expect(isValidTaxTreatment(N)).toBe(true);
  });

  it('solo se emite DTE 39 con todas las líneas afectas; mixtas o exentas no; sin datos tampoco', () => {
    expect(dte39TaxBlocker([A, A])).toBeNull();
    expect(dte39TaxBlocker([A, E])).toBe('FISCAL_NON_TAXABLE_NOT_SUPPORTED');
    expect(dte39TaxBlocker([N])).toBe('FISCAL_NON_TAXABLE_NOT_SUPPORTED');
    expect(dte39TaxBlocker([A, null])).toBe('FISCAL_TAX_LINES_NOT_VERIFIED');
    expect(dte39TaxBlocker([])).toBe('FISCAL_TAX_LINES_NOT_VERIFIED');
  });
});
