import { describe, expect, it } from 'vitest';
import { isPersistedInvoiceInconsistent } from './invoiceIntegrity';

describe('invoice editor integrity guard', () => {
  it('blocks a persisted invoice with a positive total and no items', () => {
    expect(isPersistedInvoiceInconsistent({ id: 'invoice-1', total: 1500, crm_invoice_items: [] })).toBe(true);
  });

  it('does not classify a new draft or a valid persisted invoice as inconsistent', () => {
    expect(isPersistedInvoiceInconsistent({ total: 1500, crm_invoice_items: [] })).toBe(false);
    expect(isPersistedInvoiceInconsistent({ id: 'invoice-1', total: 1500, crm_invoice_items: [{ id: 'item-1' }] })).toBe(false);
  });
});
