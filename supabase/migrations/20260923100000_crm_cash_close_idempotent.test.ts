/**
 * 20260923100000_crm_cash_close_idempotent.sql — tests estáticos
 * (source-scan) de CAJA-CIERRE-IDEMPOTENTE-1. Mismo criterio que el resto
 * de las migraciones de este repo (`npx vitest run` no tiene Postgres
 * disponible): esta suite prueba que el DDL correcto existe en el código
 * fuente. La prueba de comportamiento real vive en
 * supabase/diagnostics/verify_crm_cash_close_idempotent.sql (+ el script de
 * concurrencia real verify_crm_cash_close_idempotent_concurrency.sh),
 * corridos manualmente contra un stack local.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260923100000_crm_cash_close_idempotent.sql?raw';
import originalSource from './20260915180000_crm_cash_session_reconciliations.sql?raw';

const stripComments = (sql: string) => sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const codeOnly = stripComments(migrationSource);

const rpcMatch = codeOnly.match(
  /CREATE OR REPLACE FUNCTION public\.crm_close_cash_session\([\s\S]*?\n\$\$;/,
);
const rpcSource = rpcMatch ? rpcMatch[0] : '';

const triggerFnMatch = codeOnly.match(
  /CREATE OR REPLACE FUNCTION public\.crm_cash_sessions_block_reopen_reconciled\(\)[\s\S]*?\n\$\$;/,
);
const triggerFnSource = triggerFnMatch ? triggerFnMatch[0] : '';

describe('crm_close_cash_session — firma y permisos', () => {
  it('redefine la RPC con CREATE OR REPLACE y la MISMA firma (uuid, jsonb, text) -- sin DROP ni overload nuevo', () => {
    expect(rpcSource).toMatch(
      /crm_close_cash_session\(\s*p_session_id UUID,\s*p_reconciliations JSONB,[^\n]*\n\s*p_closing_notes TEXT DEFAULT NULL\s*\) RETURNS JSONB/,
    );
    expect(codeOnly).not.toMatch(/DROP FUNCTION[^;]*crm_close_cash_session/);
  });

  it('sigue siendo SECURITY DEFINER con search_path fijo a public', () => {
    expect(rpcSource).toMatch(/SECURITY DEFINER/);
    expect(rpcSource).toMatch(/SET search_path = public/);
  });

  it('revoca PUBLIC, anon y authenticated y otorga EXECUTE solo a authenticated (patrón de 20260921150000)', () => {
    expect(codeOnly).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_close_cash_session\(uuid, jsonb, text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(codeOnly).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_close_cash_session\(uuid, jsonb, text\) TO authenticated;/,
    );
    expect(codeOnly).not.toMatch(/GRANT[^;]*crm_close_cash_session[^;]*TO[^;]*anon/);
  });

  it('recarga el schema cache de PostgREST', () => {
    expect(codeOnly).toMatch(/NOTIFY pgrst, 'reload schema';/);
  });
});

describe('crm_close_cash_session — idempotencia sin reescribir cierres', () => {
  it('mantiene el lock FOR UPDATE y el filtro de ownership por auth.uid()', () => {
    expect(rpcSource).toMatch(/FOR UPDATE OF s;/);
    expect(rpcSource).toMatch(/b\.user_id = auth\.uid\(\)/);
  });

  it('nunca usa UPSERT/ON CONFLICT ni UPDATE/DELETE sobre crm_cash_session_reconciliations', () => {
    expect(codeOnly).not.toMatch(/ON CONFLICT/i);
    expect(codeOnly).not.toMatch(/UPDATE\s+public\.crm_cash_session_reconciliations/i);
    expect(codeOnly).not.toMatch(/DELETE\s+FROM\s+public\.crm_cash_session_reconciliations/i);
  });

  it('la única escritura en conciliaciones sigue siendo el INSERT del cierre nuevo', () => {
    const inserts = rpcSource.match(/INSERT INTO public\.crm_cash_session_reconciliations/g) || [];
    expect(inserts).toHaveLength(1);
  });

  it('una caja ya cerrada con snapshot equivalente devuelve el snapshot existente con already_closed=true ANTES de cualquier escritura', () => {
    const closedBranch = rpcSource.indexOf("IF v_session.status <> 'open' THEN");
    const replayReturn = rpcSource.indexOf("'already_closed', true");
    const insert = rpcSource.indexOf('INSERT INTO public.crm_cash_session_reconciliations');
    const update = rpcSource.indexOf('UPDATE public.crm_cash_sessions');
    expect(closedBranch).toBeGreaterThan(-1);
    expect(replayReturn).toBeGreaterThan(closedBranch);
    expect(replayReturn).toBeLessThan(insert);
    expect(replayReturn).toBeLessThan(update);
  });

  it('compara medios, montos (como NUMERIC(12,2)), notas por medio y observación general', () => {
    expect(rpcSource).toMatch(/v_existing_count = \(SELECT count\(\*\) FROM jsonb_object_keys\(v_sent\)\)/);
    expect(rpcSource).toMatch(/NOT \(v_sent \? r\.payment_method\)/);
    expect(rpcSource).toMatch(/r\.reconciled_amount IS DISTINCT FROM[^\n]*::NUMERIC\(12,2\)/);
    expect(rpcSource).toMatch(/r\.notes IS DISTINCT FROM NULLIF\(/);
    expect(rpcSource).toMatch(/v_session\.closing_notes[\s\S]*IS NOT DISTINCT FROM[\s\S]*p_closing_notes/);
  });

  it('payload distinto sobre caja cerrada -> error de dominio P0001 con HINT CASH_SESSION_ALREADY_CLOSED_DIFFERENT', () => {
    expect(rpcSource).toMatch(/IF NOT v_same THEN\s*RAISE EXCEPTION[\s\S]*?ERRCODE = 'P0001'[\s\S]*?HINT = 'CASH_SESSION_ALREADY_CLOSED_DIFFERENT'/);
  });

  it('caja cerrada sin snapshot (legacy) -> error de dominio con HINT CASH_SESSION_ALREADY_CLOSED', () => {
    expect(rpcSource).toMatch(/IF v_existing_count = 0 THEN\s*RAISE EXCEPTION 'La caja ya está cerrada'\s*USING ERRCODE = 'P0001',\s*HINT = 'CASH_SESSION_ALREADY_CLOSED';/);
  });

  it('caja abierta con conciliaciones previas -> error de dominio ANTES del INSERT (nunca llega al 23505)', () => {
    const guard = rpcSource.search(/IF v_existing_count > 0 THEN\s*RAISE EXCEPTION[\s\S]*?HINT = 'CASH_SESSION_REOPENED_WITH_RECONCILIATION'/);
    const insert = rpcSource.indexOf('INSERT INTO public.crm_cash_session_reconciliations');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(insert);
  });

  it('el cierre nuevo devuelve already_closed=false', () => {
    expect(rpcSource).toMatch(/'already_closed', false/);
  });

  it('conserva las validaciones server-side del cierre original', () => {
    expect(rpcSource).toMatch(/Falta conciliar %/);
    expect(rpcSource).toMatch(/Debes indicar una observación/);
    expect(rpcSource).toMatch(/Medio de pago inválido/);
    expect(rpcSource).toMatch(/Monto conciliado inválido/);
    expect(rpcSource).toMatch(/payment_method NOT IN \('cash', 'credit'\)/);
  });
});

describe('trigger — bloquea closed -> open en cajas con conciliación', () => {
  it('la función del trigger existe, es SECURITY DEFINER y solo bloquea closed -> open con conciliaciones', () => {
    expect(triggerFnSource).toMatch(/SECURITY DEFINER/);
    expect(triggerFnSource).toMatch(/SET search_path = public/);
    expect(triggerFnSource).toMatch(/OLD\.status = 'closed' AND NEW\.status = 'open' AND EXISTS \(/);
    expect(triggerFnSource).toMatch(/HINT = 'CASH_SESSION_RECONCILED_REOPEN_BLOCKED'/);
  });

  it('es BEFORE UPDATE OF status FOR EACH ROW, solo cuando cambia el status', () => {
    expect(codeOnly).toMatch(
      /CREATE TRIGGER trg_crm_cash_sessions_block_reopen_reconciled\s+BEFORE UPDATE OF status ON public\.crm_cash_sessions\s+FOR EACH ROW\s+WHEN \(OLD\.status IS DISTINCT FROM NEW\.status\)/,
    );
  });

  it('la función del trigger no queda ejecutable por clientes', () => {
    expect(codeOnly).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_cash_sessions_block_reopen_reconciled\(\) FROM PUBLIC, anon, authenticated;/,
    );
  });
});

describe('datos históricos — la migración no modifica ni valida filas existentes', () => {
  it('no contiene UPDATE/DELETE/INSERT de datos fuera de los cuerpos de funciones', () => {
    const outsideFunctions = codeOnly.replace(/AS \$\$[\s\S]*?\n\$\$;/g, '');
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+public\./i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(outsideFunctions).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it('no referencia ninguna sesión puntual de producción', () => {
    expect(codeOnly).not.toMatch(/576511e7/i);
    expect(codeOnly).not.toMatch(/972e14a7/i);
  });

  it('no agrega CHECK/constraint validado sobre crm_cash_sessions (fallaría con sesiones open que ya tienen snapshot)', () => {
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_cash_sessions/i);
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_cash_session_reconciliations/i);
  });

  it('mantiene la UNIQUE (session_id, payment_method) definida en 20260915180000', () => {
    expect(stripComments(originalSource)).toMatch(
      /CONSTRAINT crm_cash_session_reconciliations_session_method_uq UNIQUE \(session_id, payment_method\)/,
    );
    expect(codeOnly).not.toMatch(/DROP CONSTRAINT/i);
    expect(codeOnly).not.toMatch(/crm_cash_session_reconciliations_session_method_uq/);
  });
});
