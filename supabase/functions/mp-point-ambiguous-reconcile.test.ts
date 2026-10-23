import { describe, expect, it } from 'vitest';
import create from './mp-point-create-order/index.ts?raw';
import reconcile from './mp-point-reconcile/index.ts?raw';

describe('Point — unattended recovery after ambiguous create (regression)', () => {
  it('keeps a durable original idempotency key for safe retries', () => {
    expect(create).toContain('create_idempotency_key: createKey');
    expect(create).toContain("'MP_CREATE_AMBIGUOUS'");
    expect(create).toContain("String(operation.create_idempotency_key)");
  });

  it('automated reconciliation must include stale creating operations without an MP order id', () => {
    // RED until reconciler handles ambiguous creation. A query restricted to
    // .not('mp_order_id', 'is', null) cannot recover this case.
    expect(reconcile).toMatch(/mp_status[^\n]*creating|\['creating'\]|'creating'/);
    expect(reconcile).toContain('create_idempotency_key');
    expect(reconcile).toContain('external_reference');
  });

  it('retries with the original persisted key and checks remote correlation', () => {
    expect(reconcile).toContain("'X-Idempotency-Key': String(op.create_idempotency_key)");
    expect(reconcile).toContain('external_reference: op.external_reference');
    expect(reconcile).toContain('terminal_id: op.terminal_id');
    expect(reconcile).toContain('recovered.external_reference !== op.external_reference');
    expect(reconcile).toContain('Number(recovered.amount) !== Number(op.amount)');
    expect(reconcile).toContain('10 * 60_000');
  });

  it('must not release stock solely because an order id is missing', () => {
    expect(reconcile).not.toMatch(/!op\.mp_order_id[\s\S]{0,160}crm_point_release_stock/);
  });
});
