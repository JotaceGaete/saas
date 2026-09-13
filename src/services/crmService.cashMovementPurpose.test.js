/**
 * crmService.js — createCashMovement() — CAJA-COSTOS-1.
 *
 * Separa "movimiento de dinero" (Caja) de "nuevo costo económico". Cubre
 * el contrato del wrapper: qué RPC se llama y con qué parámetros para
 * cada movementPurpose, y que el flujo legacy (isExpense boolean, sin
 * movementPurpose) sigue exactamente igual que antes de este ticket.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

import { createCashMovement } from './crmService';

function insertResult(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockResolvedValue({ data: { movement_id: 'mv1', cost_item_id: null }, error: null });
  fromMock.mockImplementation(() => insertResult({ data: { id: 'mv1' }, error: null }));
});

const base = {
  sessionId: 'sess1',
  direction: 'out',
  amount: 200000,
  reason: 'Adelanto Juan',
  category: 'salaries',
  month: 9,
  year: 2026,
};

describe('createCashMovement — movementPurpose (CAJA-COSTOS-1)', () => {
  it('new_expense llama a create_cash_movement_with_purpose con p_movement_purpose=new_expense y sin costo relacionado', async () => {
    await createCashMovement('biz1', { ...base, category: 'other_expense', reason: 'Reparación', amount: 40000, movementPurpose: 'new_expense' });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, params] = rpcMock.mock.calls[0];
    expect(fnName).toBe('create_cash_movement_with_purpose');
    expect(params.p_movement_purpose).toBe('new_expense');
    expect(params.p_related_cost_item_id).toBeNull();
    expect(params.p_business_id).toBe('biz1');
    expect(params.p_amount).toBe(40000);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('cost_payment llama al RPC nuevo con related_cost_item_id cuando se provee', async () => {
    await createCashMovement('biz1', { ...base, movementPurpose: 'cost_payment', relatedCostItemId: 'cost-sueldo-juan' });

    const [fnName, params] = rpcMock.mock.calls[0];
    expect(fnName).toBe('create_cash_movement_with_purpose');
    expect(params.p_movement_purpose).toBe('cost_payment');
    expect(params.p_related_cost_item_id).toBe('cost-sueldo-juan');
  });

  it('cost_payment sin costo seleccionado envía related_cost_item_id null (el vínculo es opcional)', async () => {
    await createCashMovement('biz1', { ...base, movementPurpose: 'cost_payment' });

    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_related_cost_item_id).toBeNull();
  });

  it.each(['inventory_purchase', 'owner_withdrawal', 'other_non_operating'])(
    '%s llama al RPC nuevo y NUNCA persiste related_cost_item_id aunque se pase uno por error',
    async (purpose) => {
      await createCashMovement('biz1', { ...base, movementPurpose: purpose, relatedCostItemId: 'algun-costo' });

      const [fnName, params] = rpcMock.mock.calls[0];
      expect(fnName).toBe('create_cash_movement_with_purpose');
      expect(params.p_movement_purpose).toBe(purpose);
      expect(params.p_related_cost_item_id).toBeNull();
    },
  );

  it('movementPurpose con direction=in NO llama al RPC nuevo (el flujo de propósito es solo para salidas)', async () => {
    await createCashMovement('biz1', { ...base, direction: 'in', category: 'cash_fund', movementPurpose: 'new_expense' });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith('crm_cash_movements');
  });
});

describe('createCashMovement — compatibilidad legacy (isExpense, sin movementPurpose)', () => {
  it('isExpense=true sigue llamando a create_cash_movement_with_expense (el RPC legacy, sin tocar)', async () => {
    await createCashMovement('biz1', { ...base, isExpense: true });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, params] = rpcMock.mock.calls[0];
    expect(fnName).toBe('create_cash_movement_with_expense');
    expect(params.p_business_id).toBe('biz1');
    expect(params.p_category).toBe('salaries');
    // El RPC legacy nunca recibe movement_purpose ni related_cost_item_id -- no existían en su firma.
    expect(params.p_movement_purpose).toBeUndefined();
    expect(params.p_related_cost_item_id).toBeUndefined();
  });

  it('sin isExpense ni movementPurpose, hace un insert directo sin gasto (comportamiento histórico)', async () => {
    await createCashMovement('biz1', { ...base, category: 'owner_withdrawal' });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith('crm_cash_movements');
  });
});
