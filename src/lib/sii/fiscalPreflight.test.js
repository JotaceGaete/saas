import { describe, it, expect } from 'vitest';
import { createFiscalDraft } from './fiscalDraft';
import { validateFiscalSale, assertReadyForSubmission } from './fiscalPreflight';

const config = { businessId: 'a', issuerRut: '12345678-5', countryCode: 'CL', environment: 'certification', certifiedDocumentTypes: [39] };
const draft = createFiscalDraft({ businessId: 'a', issuerRut: '12345678-5', saleId: 's1', paymentMethod: 'cash', items: [{ name: 'Producto', quantity: 1, unitPrice: 1000 }] });

describe('preflight tributario estricto', () => {
  it('acepta solamente datos del mismo contribuyente', () => {
    expect(validateFiscalSale(draft, config).total).toBe(1000);
    expect(() => validateFiscalSale(draft, { ...config, businessId: 'b' })).toThrow();
    expect(() => validateFiscalSale(draft, { ...config, issuerRut: '11111111-1' })).toThrow();
  });
  it('bloquea producción sin habilitación expresa', () => {
    expect(() => validateFiscalSale(draft, { ...config, environment: 'production' })).toThrow();
  });
  it('rechaza material sensible recibido desde cliente', () => {
    expect(() => validateFiscalSale(draft, { ...config, privateKey: 'secret' })).toThrow();
  });
  it('nunca permite envío sin todas las verificaciones', () => {
    expect(() => assertReadyForSubmission({ configuration: config, draft, folio: 1, signedXml: '', schemaValidated: false, cafVerified: false, authorizedSigner: false, siiToken: '' })).toThrow();
  });
});
