import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261030191500_sii_pending_folio.sql', import.meta.url), 'utf8');

test('pending issuance retains the provider folio', () => {
  assert.match(migration, /status = p_status, folio = p_folio/);
  assert.match(migration, /status = 'sending'/);
});
test('reconciliation matches an already assigned folio', () => {
  assert.match(migration, /folio is null or folio = p_folio/);
  assert.match(migration, /status = 'unknown'/);
});
test('RPCs remain backend-only', () => {
  assert.equal((migration.match(/to service_role;/g) || []).length, 2);
  assert.equal((migration.match(/from public, anon, authenticated;/g) || []).length, 2);
});
