import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261029110000_sii_issuance_pilot.sql', import.meta.url), 'utf8');

test('fiscal migration has tenant-safe uniqueness and invoice ownership', () => {
  assert.ok(migration.includes('unique (business_id, sale_id, dte_type)'));
  assert.ok(migration.includes('unique (business_id, operation_id, dte_type)'));
  assert.ok(migration.includes('foreign key (sale_id, business_id)'));
});

test('fiscal claim cannot resend a previously claimed sale', () => {
  assert.ok(migration.includes('on conflict (business_id, sale_id, dte_type) do nothing'));
  assert.ok(migration.includes('return v_id is not null'));
  assert.ok(migration.includes('p_dte_type is distinct from 39'));
});

test('fiscal finalize requires a sending operation and complete issuance', () => {
  assert.ok(migration.includes("and operation_id = p_operation_id and status = 'sending'"));
  assert.ok(migration.includes("p_status is null or p_status not in ('issued', 'unknown')"));
  assert.ok(migration.includes('p_folio <= 0'));
  assert.ok(migration.includes("nullif(p_xml_base64, '') is null"));
  assert.ok(migration.includes("nullif(p_pdf_base64, '') is null"));
});

test('browser roles cannot access fiscal ledger or RPC', () => {
  assert.ok(migration.includes('enable row level security'));
  assert.ok(migration.includes('revoke all on public.crm_fiscal_issuances from anon, authenticated'));
  assert.ok(migration.includes('to service_role'));
});
