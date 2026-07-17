import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260717120000_crm_invoice_atomic_documents.sql'),
  'utf8',
);
const service = fs.readFileSync(path.resolve(process.cwd(), 'src/services/crmService.js'), 'utf8');

function sqlFunction(name) {
  const start = migration.indexOf(`FUNCTION public.${name}`);
  const next = migration.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
  return migration.slice(start, next < 0 ? migration.length : next);
}

describe('atomic CRM invoice persistence contract', () => {
  it('creates header and items in one RPC so an invalid item rolls the statement back', () => {
    const body = sqlFunction('crm_create_invoice_document');
    expect(body).toContain('INSERT INTO public.crm_invoices');
    expect(body).toContain('crm_insert_invoice_items(v_invoice.id, p_items)');
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/);
  });

  it('replaces items and updates the header in the same update RPC', () => {
    const body = sqlFunction('crm_update_invoice_document');
    expect(body).toContain('crm_assert_invoice_owner(p_invoice_id)');
    expect(sqlFunction('crm_assert_invoice_owner')).toContain('FOR UPDATE OF i');
    expect(body).toContain('DELETE FROM public.crm_invoice_items');
    expect(body).toContain('crm_insert_invoice_items(p_invoice_id, p_items)');
    expect(body).toContain('UPDATE public.crm_invoices');
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/);
  });

  it('allocates distinct numbers through an atomic row upsert instead of MAX()+1 alone', () => {
    const body = sqlFunction('crm_take_document_number');
    expect(body).toContain('ON CONFLICT (business_id, document_type) DO UPDATE');
    expect(body).toContain('last_number = sequence.last_number + 1');
    expect(migration).toContain('PRIMARY KEY (business_id, document_type)');
  });

  it('routes all four invoice writers through the transactional RPCs', () => {
    expect((service.match(/rpc\('crm_create_invoice_document'/g) || [])).toHaveLength(3);
    expect((service.match(/rpc\('crm_update_invoice_document'/g) || [])).toHaveLength(1);
    const invoiceSection = service.slice(service.indexOf('export async function createCrmInvoice'), service.indexOf('export async function updateCrmInvoiceStatus'));
    expect(invoiceSection).not.toContain("from('crm_invoice_items')");
  });
});
