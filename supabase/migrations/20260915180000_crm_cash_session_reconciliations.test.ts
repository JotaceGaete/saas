/**
 * 20260915180000_crm_cash_session_reconciliations.sql — tests estáticos
 * (source-scan) de CAJA-CIERRE-CONCILIACION-1. Mismo criterio que el resto
 * de las migraciones de este repo (`npx vitest run` no tiene Postgres
 * disponible): esta suite prueba que el DDL/DML correcto existe en el
 * código fuente, no que Postgres lo ejecuta -- la prueba de comportamiento
 * real vive en supabase/diagnostics/verify_crm_cash_session_reconciliations.sql,
 * corrida manualmente contra un stack local.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260915180000_crm_cash_session_reconciliations.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('crm_cash_session_reconciliations — tabla', () => {
  it('la tabla existe', () => {
    expect(codeOnly).toMatch(/CREATE TABLE public\.crm_cash_session_reconciliations/);
  });

  it('tiene UNIQUE(session_id, payment_method)', () => {
    expect(codeOnly).toMatch(
      /CONSTRAINT crm_cash_session_reconciliations_session_method_uq UNIQUE \(session_id, payment_method\)/,
    );
  });

  it('el CHECK de payment_method incluye los 8 medios soportados, incluido el legacy \'card\'', () => {
    const checkMatch = codeOnly.match(/payment_method\s+TEXT NOT NULL CHECK \(payment_method IN \(([\s\S]*?)\)\)/);
    expect(checkMatch).toBeTruthy();
    const values = checkMatch[1];
    for (const value of [
      'cash', 'card', 'debit_card', 'credit_card',
      'bank_transfer', 'mercado_pago', 'check', 'other',
    ]) {
      expect(values).toContain(`'${value}'`);
    }
  });

  it('difference es una columna GENERATED ALWAYS AS (reconciled_amount - expected_amount) STORED', () => {
    expect(codeOnly).toMatch(
      /difference\s+NUMERIC\(12,2\) GENERATED ALWAYS AS \(reconciled_amount - expected_amount\) STORED/,
    );
  });

  it('referencia business_id/session_id con ON DELETE CASCADE', () => {
    expect(codeOnly).toMatch(/business_id\s+UUID NOT NULL REFERENCES public\.wa_businesses\(id\) ON DELETE CASCADE/);
    expect(codeOnly).toMatch(/session_id\s+UUID NOT NULL REFERENCES public\.crm_cash_sessions\(id\) ON DELETE CASCADE/);
  });

  it('tiene índices por business_id y session_id', () => {
    expect(codeOnly).toMatch(
      /CREATE INDEX idx_crm_cash_session_reconciliations_business ON public\.crm_cash_session_reconciliations \(business_id\)/,
    );
    expect(codeOnly).toMatch(
      /CREATE INDEX idx_crm_cash_session_reconciliations_session ON public\.crm_cash_session_reconciliations \(session_id\)/,
    );
  });
});

describe('crm_cash_session_reconciliations — RLS: solo SELECT, nunca INSERT/UPDATE/DELETE para el cliente', () => {
  it('RLS está habilitado', () => {
    expect(codeOnly).toMatch(/ALTER TABLE public\.crm_cash_session_reconciliations ENABLE ROW LEVEL SECURITY/);
  });

  it('existe exactamente 1 policy (SELECT) -- ninguna de INSERT/UPDATE/DELETE', () => {
    const policyMatches = codeOnly.match(/CREATE POLICY[^;]*ON public\.crm_cash_session_reconciliations[^;]*;/g) || [];
    expect(policyMatches.length).toBe(1);
    expect(policyMatches[0]).toMatch(/FOR SELECT TO authenticated/);
    expect(codeOnly).not.toMatch(/FOR INSERT[\s\S]{0,40}crm_cash_session_reconciliations|crm_cash_session_reconciliations[\s\S]{0,40}FOR INSERT/);
    expect(codeOnly).not.toMatch(/FOR UPDATE[\s\S]{0,10}ON public\.crm_cash_session_reconciliations/);
    expect(codeOnly).not.toMatch(/FOR DELETE[\s\S]{0,10}ON public\.crm_cash_session_reconciliations/);
  });

  it('la policy de SELECT filtra por business_id del dueño autenticado', () => {
    expect(codeOnly).toMatch(
      /USING \(business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\)\)/,
    );
  });

  it('el GRANT a authenticated es únicamente SELECT (no INSERT/UPDATE/DELETE)', () => {
    expect(codeOnly).toMatch(/GRANT SELECT ON TABLE public\.crm_cash_session_reconciliations TO authenticated;/);
    expect(codeOnly).not.toMatch(/GRANT[^;]*INSERT[^;]*ON TABLE public\.crm_cash_session_reconciliations/);
  });
});

describe('crm_close_cash_session — RPC', () => {
  const rpcMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.crm_close_cash_session\([\s\S]*?\n\$\$;/,
  );

  it('el RPC existe', () => {
    expect(rpcMatch).toBeTruthy();
  });

  const rpcSource = rpcMatch ? rpcMatch[0] : '';

  it('es SECURITY DEFINER con search_path fijo a public', () => {
    expect(rpcSource).toMatch(/SECURITY DEFINER/);
    expect(rpcSource).toMatch(/SET search_path = public/);
  });

  it('toma un lock de fila (FOR UPDATE) sobre la sesión antes de leer/escribir nada', () => {
    expect(rpcSource).toMatch(/FOR UPDATE OF s;/);
  });

  it('rechaza el cierre si la sesión no está status=\'open\'', () => {
    expect(rpcSource).toMatch(/IF v_session\.status <> 'open' THEN/);
    expect(rpcSource).toMatch(/La caja ya está cerrada/);
  });

  it('valida ownership del negocio contra auth.uid() vía wa_businesses', () => {
    expect(rpcSource).toMatch(/JOIN public\.wa_businesses b ON b\.id = s\.business_id/);
    expect(rpcSource).toMatch(/b\.user_id = auth\.uid\(\)/);
  });

  it('el cálculo de efectivo esperado filtra crm_cash_movements por payment_method = \'cash\'', () => {
    const cashBlockMatch = rpcSource.match(/SELECT 'cash' AS method,[\s\S]*?AS amount/);
    expect(cashBlockMatch).toBeTruthy();
    const cashBlock = cashBlockMatch[0];
    expect(cashBlock).toMatch(/direction = 'in' AND payment_method = 'cash'/);
    expect(cashBlock).toMatch(/direction = 'out' AND payment_method = 'cash'/);
  });

  it('el efectivo esperado incluye initial_amount + cobros cash de crm_payments', () => {
    const cashBlockMatch = rpcSource.match(/SELECT 'cash' AS method,[\s\S]*?AS amount/);
    expect(cashBlockMatch[0]).toMatch(/COALESCE\(v_session\.initial_amount, 0\)/);
    expect(cashBlockMatch[0]).toMatch(/cash_session_id = p_session_id AND voided_at IS NULL\s+AND payment_method = 'cash'/);
  });

  it('los pagos no-efectivo esperados excluyen \'credit\' (cuenta corriente) además de \'cash\'', () => {
    expect(rpcSource).toMatch(/payment_method NOT IN \('cash', 'credit'\)/);
  });

  it('calcula v_expected 100% server-side -- nunca usa un expected_amount recibido del cliente', () => {
    expect(rpcSource).not.toMatch(/p_reconciliations[\s\S]{0,80}expected_amount/);
  });

  it('rechaza el cierre si falta conciliar un medio con actividad real (calculado server-side)', () => {
    expect(rpcSource).toMatch(/FOR v_method IN SELECT jsonb_object_keys\(v_expected\)/);
    expect(rpcSource).toMatch(/IF NOT \(v_sent \? v_method\) THEN/);
    expect(rpcSource).toMatch(/Falta conciliar %/);
  });

  it('exige p_closing_notes no vacío cuando hay diferencia en cualquier medio', () => {
    expect(rpcSource).toMatch(/IF v_has_diff AND \(p_closing_notes IS NULL OR btrim\(p_closing_notes\) = ''\) THEN/);
    expect(rpcSource).toMatch(/Debes indicar una observación/);
  });

  it('valida el vocabulario de payment_method en cada línea enviada', () => {
    expect(rpcSource).toMatch(
      /v_method NOT IN \('cash','card','debit_card','credit_card','bank_transfer','mercado_pago','check','other'\)/,
    );
  });

  it('rechaza reconciled_amount NULL o negativo', () => {
    expect(rpcSource).toMatch(/IF v_reconciled IS NULL OR v_reconciled < 0 THEN/);
  });

  it('persiste una fila en crm_cash_session_reconciliations por cada medio enviado', () => {
    expect(rpcSource).toMatch(/INSERT INTO public\.crm_cash_session_reconciliations/);
    expect(rpcSource).toMatch(/FOR v_method IN SELECT jsonb_object_keys\(v_sent\)/);
  });

  it('actualiza crm_cash_sessions con expected_cash/counted_cash/cash_difference/closing_notes/closed_by/closed_at/status', () => {
    const updateMatch = rpcSource.match(/UPDATE public\.crm_cash_sessions[\s\S]*?WHERE id = p_session_id/);
    expect(updateMatch).toBeTruthy();
    for (const col of ['expected_cash', 'counted_cash', 'cash_difference', 'closing_notes', 'closed_by', 'closed_at', "status          = 'closed'"]) {
      expect(updateMatch[0]).toContain(col);
    }
  });

  it('el UPDATE de cierre no toca sesiones de otro negocio -- filtra por id ya validado contra auth.uid() arriba', () => {
    const updateMatch = rpcSource.match(/UPDATE public\.crm_cash_sessions[\s\S]*?WHERE id = p_session_id/);
    expect(updateMatch[0]).toMatch(/WHERE id = p_session_id/);
  });

  it('retorna JSONB con session + reconciliations', () => {
    expect(rpcSource).toMatch(/RETURN jsonb_build_object\(\s*'session', to_jsonb\(v_session\),\s*'reconciliations',/);
  });
});

describe('crm_close_cash_session — permisos', () => {
  it('revoca PUBLIC y otorga EXECUTE solo a authenticated', () => {
    expect(codeOnly).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_close_cash_session\(UUID, JSONB, TEXT\) FROM PUBLIC;/,
    );
    expect(codeOnly).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_close_cash_session\(UUID, JSONB, TEXT\) TO authenticated;/,
    );
  });
});

describe('CAJA-CIERRE-CONCILIACION-1 — no toca closeCashSession legacy ni RLS de tablas existentes', () => {
  it('no redefine ni elimina ninguna función/policy de crm_cash_sessions, crm_cash_movements o crm_payments', () => {
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_cash_sessions/);
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_cash_movements/);
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_payments/);
    expect(codeOnly).not.toMatch(/DROP POLICY/i);
  });

  it('recarga el schema cache de PostgREST al final', () => {
    expect(codeOnly.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});
