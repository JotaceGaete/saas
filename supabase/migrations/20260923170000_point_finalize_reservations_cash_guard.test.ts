import { describe, it, expect } from 'vitest';
import migrationSource from './20260923170000_point_finalize_reservations_cash_guard.sql?raw';
import posSource from './20260923180000_pos_respects_point_stock_reservations.sql?raw';

const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

describe('POINT-SMART-2-8 SQL syntax/invariants', () => {
  it('stock helper uses valid double dollar PL/pgSQL delimiter', () => {
    const fn=migrationSource.match(/CREATE OR REPLACE FUNCTION public\.crm_point_assert_stock_available[\s\S]*?REVOKE ALL ON FUNCTION public\.crm_point_assert_stock_available/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toContain('AS $$');
    expect(fn![0]).toContain('END;\n$$;');
  });
  it('finalizer is service-role only and idempotently returns existing invoice', () => {
    expect(codeOnly).toContain("IF auth.role() <> 'service_role'");
    expect(codeOnly).toContain('IF v_op.crm_invoice_id IS NOT NULL THEN');
    expect(codeOnly).toContain('pos_idempotency_key=v_op.sale_idempotency_key');
    expect(codeOnly).toContain('GRANT EXECUTE ON FUNCTION public.crm_finalize_point_sale(UUID) TO service_role');
  });
  it('finalizer requires processed, original open cash session, amount match and own reservation', () => {
    expect(codeOnly).toContain("IF v_op.mp_status <> 'processed'");
    expect(codeOnly).toContain("status='open'");
    expect(codeOnly).toContain('POINT_AMOUNT_MISMATCH');
    expect(codeOnly).toContain('POINT_STOCK_RESERVATION_MISSING');
  });
  it('cash close is blocked while a Point payment can still finalize', () => {
    expect(codeOnly).toContain('crm_cash_session_block_close_pending_point');
    for (const s of ['creating','created','at_terminal','action_required','processed']) expect(codeOnly).toContain(s);
    expect(codeOnly).toContain('crm_cash_session_point_pending');
  });
  it('normal TPV is patched to respect active Point reservations', () => {
    expect(posSource).toContain('crm_point_assert_stock_available');
    expect(posSource).toContain('STOCK_INSUFFICIENT');
  });
});
