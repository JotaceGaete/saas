/**
 * crmService.js — reopenCashSession / getCashSessionById (CAJA-CIERRE-IDEMPOTENTE-1).
 *
 * reopenCashSession() sigue siendo un UPDATE directo de crm_cash_sessions
 * (no una RPC) -- la única barrera real contra reabrir una caja con
 * conciliación es el trigger crm_cash_sessions_block_reopen_reconciled
 * (20260923150000_crm_close_cash_session_idempotent_reopen_guard.sql,
 * cubierto por su propio test source-scan). Este archivo prueba solo el
 * contrato del wrapper: qué le pide a supabase y cómo traduce cada
 * respuesta -- mockeando supabase.from(), igual que crmService.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

import { reopenCashSession, getCashSessionById } from './crmService';

function queryResult(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}

beforeEach(() => {
  fromMock.mockReset();
});

const session = { id: 'sess0', business_id: 'biz1', status: 'closed' };

describe('reopenCashSession — no reabre si ya hay OTRA caja abierta', () => {
  it('devuelve un error claro y nunca llega a llamar UPDATE', async () => {
    let call = 0;
    const results = [
      { data: session, error: null },                                   // SELECT sesión a reabrir (sess0)
      { data: { id: 'sess-otra', status: 'open' }, error: null },        // getOpenCashSession -> otra caja abierta
    ];
    fromMock.mockImplementation(() => {
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return queryResult(result);
    });
    const { data, error } = await reopenCashSession('sess0');
    expect(data).toBeNull();
    expect(error.message).toBe('No se puede reabrir esta caja porque ya hay otra caja abierta.');
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});

describe('reopenCashSession — traducción de errores del UPDATE', () => {
  function mockSequence(results) {
    let call = 0;
    fromMock.mockImplementation(() => {
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return queryResult(result);
    });
  }

  it('23505 (dos pestañas abriendo a la vez) -> mensaje legible, no el código crudo', async () => {
    mockSequence([
      { data: session, error: null }, // SELECT sesión
      { data: null, error: null },    // getOpenCashSession -> sin caja abierta
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }, // UPDATE
    ]);
    const { data, error } = await reopenCashSession('sess0');
    expect(data).toBeNull();
    expect(error.message).toBe('Ya hay una caja abierta en otra pestaña. Recarga la página para verla.');
  });

  it('hint=crm_cash_session_reopen_blocked_reconciled (trigger de BD) -> mensaje legible sobre conciliación, no el error técnico', async () => {
    mockSequence([
      { data: session, error: null },
      { data: null, error: null },
      {
        data: null,
        error: {
          code: '23514',
          hint: 'crm_cash_session_reopen_blocked_reconciled',
          message: 'No se puede reabrir una caja que ya tiene conciliación registrada',
        },
      },
    ]);
    const { data, error } = await reopenCashSession('sess0');
    expect(data).toBeNull();
    expect(error.message).toBe('Esta caja ya tiene una conciliación registrada y no se puede reabrir.');
  });

  it('un error sin ese hint se pasa tal cual (no se inventa un mensaje distinto)', async () => {
    const rawError = { code: '42501', message: 'permission denied' };
    mockSequence([
      { data: session, error: null },
      { data: null, error: null },
      { data: null, error: rawError },
    ]);
    const { error } = await reopenCashSession('sess0');
    expect(error).toBe(rawError);
  });

  it('sin error, el UPDATE exitoso se devuelve tal cual', async () => {
    const updated = { ...session, status: 'open', closed_at: null };
    mockSequence([
      { data: session, error: null },
      { data: null, error: null },
      { data: updated, error: null },
    ]);
    const { data, error } = await reopenCashSession('sess0');
    expect(error).toBeNull();
    expect(data).toEqual(updated);
  });
});

describe('getCashSessionById', () => {
  it('lee la sesión por id -- usada para releer el estado real tras un error de red ambiguo al cerrar caja', async () => {
    fromMock.mockReturnValue(queryResult({ data: { id: 'sess1', status: 'closed' }, error: null }));
    const { data, error } = await getCashSessionById('sess1');
    expect(error).toBeNull();
    expect(data).toEqual({ id: 'sess1', status: 'closed' });
    expect(fromMock).toHaveBeenCalledWith('crm_cash_sessions');
  });
});
