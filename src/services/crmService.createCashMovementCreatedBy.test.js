/**
 * crmService.js — createCashMovement() — SEGURIDAD-WALINKA-1F.
 *
 * create_cash_movement_with_expense/_with_purpose insertaban created_by
 * tal cual lo enviara el caller (p_created_by), sin validar que
 * coincidiera con auth.uid() -- cualquiera con acceso al negocio podía
 * falsificar la autoría de un movimiento. createCashMovement() ya no
 * acepta un `createdBy` externo: resuelve la sesión real internamente
 * (mismo patrón que recordCashPayment/adjustStock en este archivo) y esa
 * es la única fuente de created_by, para las 3 vías (las 2 RPC y el
 * INSERT directo).
 *
 * Archivo nuevo y acotado a propósito, mismo criterio que
 * waBusinessService.getBusinessBySlug.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    auth: { getUser: (...args) => getUserMock(...args) },
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

const REAL_USER_ID = 'real-session-user-id';

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockReset();
  rpcMock.mockResolvedValue({ data: { movement_id: 'mv1', cost_item_id: null }, error: null });
  fromMock.mockImplementation(() => insertResult({ data: { id: 'mv1' }, error: null }));
  getUserMock.mockResolvedValue({ data: { user: { id: REAL_USER_ID } }, error: null });
});

describe('createCashMovement — SEGURIDAD-WALINKA-1F: created_by siempre de la sesión real', () => {
  it('movementPurpose (RPC create_cash_movement_with_purpose): p_created_by = auth.getUser().id, nunca un valor externo', async () => {
    await createCashMovement('biz1', {
      direction: 'out',
      amount: 1000,
      reason: 'Adelanto',
      category: 'salaries',
      movementPurpose: 'new_expense',
      month: 9,
      year: 2026,
    });
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('create_cash_movement_with_purpose');
    expect(rpcMock.mock.calls[0][1].p_created_by).toBe(REAL_USER_ID);
  });

  it('isExpense (RPC create_cash_movement_with_expense): p_created_by = auth.getUser().id', async () => {
    await createCashMovement('biz1', {
      direction: 'out',
      amount: 1000,
      reason: 'Compra insumos',
      category: 'supplies',
      isExpense: true,
      month: 9,
      year: 2026,
    });
    expect(rpcMock.mock.calls[0][0]).toBe('create_cash_movement_with_expense');
    expect(rpcMock.mock.calls[0][1].p_created_by).toBe(REAL_USER_ID);
  });

  it('movimiento sin gasto (INSERT directo): created_by = auth.getUser().id', async () => {
    let insertedPayload = null;
    fromMock.mockImplementation(() => ({
      insert: (payload) => {
        insertedPayload = payload;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'mv1' }, error: null }) }) };
      },
    }));
    await createCashMovement('biz1', {
      direction: 'in',
      amount: 5000,
      reason: 'Venta mostrador',
      category: 'sales',
    });
    expect(insertedPayload.created_by).toBe(REAL_USER_ID);
  });

  it('sin sesión (auth.getUser() sin user): created_by es null, nunca un valor inventado', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await createCashMovement('biz1', {
      direction: 'out',
      amount: 1000,
      reason: 'Adelanto',
      category: 'salaries',
      movementPurpose: 'new_expense',
      month: 9,
      year: 2026,
    });
    expect(rpcMock.mock.calls[0][1].p_created_by).toBeNull();
  });
});
