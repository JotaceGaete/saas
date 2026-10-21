import { describe, expect, it } from 'vitest';
import finalizer from './20260923170000_point_finalize_reservations_cash_guard.sql?raw';

const body = finalizer.match(/CREATE OR REPLACE FUNCTION public\.crm_finalize_point_sale\(p_operation_id UUID\)([\s\S]*?)\n\$\$;/)?.[1] ?? '';

describe('Point finalizer SQL — concurrency and atomicity contract (static)', () => {
  it('serializes concurrent finalizations of the same operation before reading it', () => {
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtextextended\('point-finalize:'\|\|p_operation_id::text,0\)\)/);
    expect(body).toMatch(/SELECT \* INTO v_op FROM public\.crm_pos_point_operations WHERE id=p_operation_id FOR UPDATE/);
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('SELECT * INTO v_op'));
  });

  it('returns the existing invoice before attempting any new inserts', () => {
    expect(body).toMatch(/IF v_op\.crm_invoice_id IS NOT NULL THEN[\s\S]*?RETURN NEXT v_existing; RETURN;/);
    expect(body.indexOf('IF v_op.crm_invoice_id IS NOT NULL')).toBeLessThan(body.indexOf('INSERT INTO public.crm_invoices'));
  });

  it('requires processed status and remote order id before creating a sale', () => {
    expect(body).toContain("IF v_op.mp_status <> 'processed'");
    expect(body).toContain('IF v_op.mp_order_id IS NULL');
    expect(body.indexOf("IF v_op.mp_status <> 'processed'")).toBeLessThan(body.indexOf('INSERT INTO public.crm_invoices'));
  });

  it('uses sale idempotency key and original cash session', () => {
    expect(body).toContain('pos_idempotency_key=v_op.sale_idempotency_key');
    expect(body).toContain('v_op.cash_session_id');
    expect(body).toContain('crm_take_document_number');
  });

  it('locks product rows and verifies reservation before creating invoice', () => {
    expect(body).toMatch(/FROM public\.wa_products[\s\S]*?FOR UPDATE/);
    expect(body).toContain('POINT_STOCK_RESERVATION_MISSING');
    expect(body.indexOf('POINT_STOCK_RESERVATION_MISSING')).toBeLessThan(body.indexOf('INSERT INTO public.crm_invoices'));
  });

  it('writes invoice, payment, stock movement and operation link in one SQL function', () => {
    for (const name of ['crm_invoices', 'crm_invoice_items', 'crm_payments', 'crm_stock_movements']) {
      expect(body).toContain('INSERT INTO public.' + name);
    }
    expect(body).toContain('SET crm_invoice_id=v_invoice.id,finalized_at=now()');
    expect(body).toContain('DELETE FROM public.crm_pos_point_stock_reservations');
  });

  it('limits finalization RPC to service_role', () => {
    expect(body).toContain("IF auth.role() <> 'service_role'");
    expect(finalizer).toContain('REVOKE ALL ON FUNCTION public.crm_finalize_point_sale(UUID) FROM PUBLIC, anon, authenticated');
    expect(finalizer).toContain('GRANT EXECUTE ON FUNCTION public.crm_finalize_point_sale(UUID) TO service_role');
  });
});
