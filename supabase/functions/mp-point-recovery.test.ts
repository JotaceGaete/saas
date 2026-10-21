import { describe, expect, it } from 'vitest';
import create from './mp-point-create-order/index.ts?raw';
import get from './mp-point-get-order/index.ts?raw';
import cancel from './mp-point-cancel-order/index.ts?raw';
import webhook from './mp-point-webhook/index.ts?raw';
import reconcile from './mp-point-reconcile/index.ts?raw';

describe('Point Smart 2 — recovery invariants (static; not network or Postgres integration)', () => {
  it('network loss during create returns an ambiguous result without inventing a failed payment', () => {
    expect(create).toContain("reason: 'MP_CREATE_AMBIGUOUS'");
    expect(create).toContain('operation_id: operation.id');
    expect(create).toContain('X-Idempotency-Key');
  });

  it('retry uses the persisted operation and original idempotency key, amount, terminal and reference', () => {
    expect(create).toContain(".eq('create_idempotency_key', createKey)");
    expect(create).toContain('if (operation.mp_order_id)');
    expect(create).toContain('operation.external_reference');
    expect(create).toContain('operation.amount');
    expect(create).toContain('operation.terminal_id');
    expect(create).toContain("String(operation.create_idempotency_key)");
  });

  it('ambiguous creation cannot be locally canceled or release reserved stock', () => {
    const block = cancel.match(/if \(!operation\.mp_order_id\) \{([\s\S]*?)\n  \}/);
    expect(block).not.toBeNull();
    expect(block![1]).toContain('MP_CREATE_UNRESOLVED');
    expect(block![1]).not.toContain('crm_point_release_stock');
    expect(block![1]).not.toContain("mp_status: 'canceled'");
  });

  it('polling checks remote correlation and finalizes only processed orders', () => {
    expect(get).toContain('order.id !== operation.mp_order_id');
    expect(get).toContain('order.external_reference !== operation.external_reference');
    expect(get).toContain("order.status === 'processed' && !invoiceId");
    expect(get).toContain("reason: 'POINT_FINALIZATION_PENDING'");
    expect(get).toContain("rpc('crm_finalize_point_sale'");
  });

  it('late webhook confirms order at MP and uses the same finalization RPC', () => {
    expect(webhook).toContain('MP_ORDERS_URL');
    expect(webhook).toContain('sanitizePointOrder');
    expect(webhook).toContain("order.status==='processed'&&!op.crm_invoice_id");
    expect(webhook).toContain("rpc('crm_finalize_point_sale'");
    expect(webhook).toContain("error:'finalization_failed'");
  });

  it('reconciliation can retry processed-but-unfinalized orders and defers transient errors', () => {
    expect(reconcile).toContain(".is('crm_invoice_id', null)");
    expect(reconcile).toContain("'processed'");
    expect(reconcile).toContain("rpc('crm_finalize_point_sale'");
    expect(reconcile).toContain('result.deferred++');
    expect(reconcile).toContain('order.external_reference !== op.external_reference');
  });

  it('cancel verifies remote state and does not treat an uncertain cancel as confirmed', () => {
    expect(cancel).toContain('getAuthoritative(ctx.accessToken, operation.mp_order_id)');
    expect(cancel).toContain("reason: 'MP_CANCEL_AMBIGUOUS'");
    expect(cancel).toContain("reason: 'MP_CANCEL_UNCONFIRMED'");
    expect(cancel).toContain("after.order.status !== 'canceled'");
  });
});
