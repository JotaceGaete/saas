import { describe, it, expect } from 'vitest';
import createSource from './mp-point-create-order/index.ts?raw';
import getSource from './mp-point-get-order/index.ts?raw';
import cancelSource from './mp-point-cancel-order/index.ts?raw';
import webhookSource from './mp-point-webhook/index.ts?raw';

describe('POINT-SMART-2-8 create safety', () => {
  it('reuses persisted create idempotency and sends it to MP', () => {
    expect(createSource).toContain(".eq('create_idempotency_key', createKey)");
    expect(createSource).toContain("'X-Idempotency-Key': String(operation.create_idempotency_key)");
  });
  it('ignores browser authority fields and computes total from items', () => {
    expect(createSource).toContain('body.amount !== undefined');
    expect(createSource).toContain('body.total !== undefined');
    expect(createSource).toContain('body.currency !== undefined');
    expect(createSource).toContain('parsed.items.reduce');
  });
  it('persists and reserves before calling MP', () => {
    const insert=createSource.indexOf(".from('crm_pos_point_operations')");
    const reserve=createSource.indexOf("rpc('crm_point_reserve_stock'");
    const mp=createSource.indexOf('fetch(MP_ORDERS_URL');
    expect(insert).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(insert);
    expect(mp).toBeGreaterThan(reserve);
  });
  it('captures an open cash session before charging', () => {
    expect(createSource).toContain(".from('crm_cash_sessions')");
    expect(createSource).toContain(".eq('status', 'open')");
    expect(createSource).toContain('cash_session_id: cashSession.id');
  });
});

describe('POINT-SMART-2-8 processed/recovery safety', () => {
  it('polling finalizes only processed payments', () => {
    expect(getSource).toContain("if (order.status === 'processed' && !invoiceId)");
    expect(getSource).toContain("rpc('crm_finalize_point_sale'");
  });
  it('webhook re-reads the authoritative MP order', () => {
    expect(webhookSource).toContain('wa_get_mp_connection_for_checkout');
    expect(webhookSource).toContain('fetch(`${MP_ORDERS_URL}/${encodeURIComponent(orderId)}`');
    expect(webhookSource).toContain('order.external_reference!==op.external_reference');
  });
  it('terminal non-processed states release stock', () => {
    expect(getSource).toContain("['failed', 'expired', 'canceled', 'refunded'].includes(order.status)");
    expect(getSource).toContain('crm_point_release_stock');
    expect(webhookSource).toContain("['failed','expired','canceled','refunded'].includes(order.status)");
  });
});

describe('POINT-SMART-2-8 cancellation safety', () => {
  it('reads authoritative status before cancel POST', () => {
    const get=cancelSource.indexOf('const before = await getAuthoritative');
    const post=cancelSource.indexOf("/cancel");
    expect(get).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(get);
  });
  it('at_terminal requires physical cancel and only created reaches API cancel', () => {
    expect(cancelSource).toContain("order.status === 'at_terminal'");
    expect(cancelSource).toContain('CANCEL_ON_TERMINAL_REQUIRED');
    expect(cancelSource).toContain("if (order.status !== 'created')");
  });
});
