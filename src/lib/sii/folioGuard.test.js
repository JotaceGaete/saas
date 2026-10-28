import { describe, expect, it } from 'vitest';
import { validateFolioAgainstCaf, FOLIO_RESERVATION_STATES } from './folioGuard';

const caf = { issuerRut: '12.345.678-5', documentType: 39, rangeStart: 100, rangeEnd: 200, authorizedAt: '2026-01-01', cryptographicallyVerified: true };
const input = { caf, issuerRut: '12345678-5', documentType: 39, folio: 101, issueDate: '2026-10-28' };

describe('validación defensiva de folios', () => {
  it('acepta folio en rango del emisor correcto', () => {
    expect(validateFolioAgainstCaf(input).folio).toBe(101);
  });
  it('rechaza CAF de otro emisor y rango agotado', () => {
    expect(() => validateFolioAgainstCaf({ ...input, issuerRut: '11111111-1' })).toThrow();
    expect(() => validateFolioAgainstCaf({ ...input, folio: 201 })).toThrow();
  });
  it('rechaza CAF sin verificación y documentos distintos', () => {
    expect(() => validateFolioAgainstCaf({ ...input, caf: { ...caf, cryptographicallyVerified: false } })).toThrow();
    expect(() => validateFolioAgainstCaf({ ...input, documentType: 33 })).toThrow();
  });
  it('rechaza fechas imposibles o anteriores a autorización', () => {
    expect(() => validateFolioAgainstCaf({ ...input, issueDate: '2026-02-30' })).toThrow();
    expect(() => validateFolioAgainstCaf({ ...input, issueDate: '2025-12-31' })).toThrow();
  });
  it('mantiene estado desconocido para conciliación', () => {
    expect(FOLIO_RESERVATION_STATES).toContain('unknown');
  });
});
