import { describe, expect, it } from 'vitest';
import source from './index.ts?raw';

describe('Point cancellation — ambiguous create fail-closed guard', () => {
  it('never locally cancels an operation without a remote order id', () => {
    const noOrder = source.match(/if \(!operation\.mp_order_id\) \{([\s\S]*?)\n  \}/);
    expect(noOrder).not.toBeNull();
    expect(noOrder![1]).toContain('MP_CREATE_UNRESOLVED');
    expect(noOrder![1]).not.toContain("mp_status: 'canceled'");
    expect(noOrder![1]).not.toContain('crm_point_release_stock');
  });

  it('preserves remote authoritative verification before cancellation', () => {
    expect(source).toContain('getAuthoritative(ctx.accessToken, operation.mp_order_id)');
    expect(source).toContain("order.status !== 'created' && order.status !== 'at_terminal'");
    expect(source).toContain("reason: 'MP_CANCEL_UNCONFIRMED'");
  });
});
