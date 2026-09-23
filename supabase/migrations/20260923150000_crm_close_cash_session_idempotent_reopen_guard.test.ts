/**
 * 20260923150000_crm_close_cash_session_idempotent_reopen_guard.sql — tests
 * estáticos (source-scan), mismo criterio que el resto de las migraciones de
 * este repo (`npx vitest run` no tiene Postgres disponible aquí): esta suite
 * prueba que el DDL/DML correcto existe en el código fuente, no que Postgres
 * lo ejecuta -- la prueba de comportamiento real vive en
 * supabase/diagnostics/verify_crm_cash_session_close_reopen_idempotent.sql,
 * pensada para correrse manualmente contra un stack local (no disponible en
 * este contenedor: sin Docker).
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260923150000_crm_close_cash_session_idempotent_reopen_guard.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const rpcMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_close_cash_session\([\s\S]*?\n\$\$;/,
);
const rpcSource = rpcMatch ? rpcMatch[0] : '';

describe('crm_close_cash_session — misma firma exacta', () => {
  it('el RPC existe con la firma (uuid, jsonb, text) sin cambios', () => {
    expect(rpcMatch).toBeTruthy();
    expect(rpcSource).toMatch(/p_session_id UUID,/);
    expect(rpcSource).toMatch(/p_reconciliations JSONB,/);
    expect(rpcSource).toMatch(/p_closing_notes TEXT DEFAULT NULL/);
  });

  it('sigue siendo SECURITY DEFINER con search_path fijo a public', () => {
    expect(rpcSource).toMatch(/SECURITY DEFINER/);
    expect(rpcSource).toMatch(/SET search_path = public/);
  });

  it('sigue tomando FOR UPDATE sobre la sesión antes de leer/escribir nada', () => {
    expect(rpcSource).toMatch(/FOR UPDATE OF s;/);
  });

  it('sigue validando ownership del negocio contra auth.uid() vía wa_businesses', () => {
    expect(rpcSource).toMatch(/JOIN public\.wa_businesses b ON b\.id = s\.business_id/);
    expect(rpcSource).toMatch(/b\.user_id = auth\.uid\(\)/);
  });
});

describe('crm_close_cash_session — B) closed + mismo payload = idempotente', () => {
  it('cuenta las filas ya persistidas antes de decidir', () => {
    expect(rpcSource).toMatch(
      /SELECT count\(\*\) INTO v_stored_count\s+FROM public\.crm_cash_session_reconciliations\s+WHERE session_id = p_session_id;/,
    );
  });

  it('la comparación es numérica (NUMERIC = NUMERIC), no de texto/JSON crudo', () => {
    expect(rpcSource).toMatch(
      /r\.reconciled_amount = NULLIF\(\(v_sent -> r\.payment_method\) ->> 'reconciled_amount', ''\)::numeric/,
    );
  });

  it('la comparación de notas normaliza NULL\\/\'\'\\/espacios en ambos lados (btrim + NULLIF + COALESCE)', () => {
    // El patrón se usa 4 veces en total (notas por medio -- lado
    // persistido y lado enviado -- y closing_notes -- lado persistido y
    // lado enviado); esta regex simple no soporta paréntesis anidados
    // (como en `btrim((v_sent -> r.payment_method) ->> 'notes')`), así que
    // cuenta solo 3 -- suficiente para confirmar que el patrón de
    // normalización se aplica repetidamente, no una sola vez.
    const notesMatches = rpcSource.match(/COALESCE\(NULLIF\(btrim\([^)]*\), ''\), ''\)/g) || [];
    expect(notesMatches.length).toBeGreaterThanOrEqual(3);
    expect(rpcSource).toMatch(/COALESCE\(NULLIF\(btrim\(\(v_sent -> r\.payment_method\) ->> 'notes'\), ''\), ''\)/);
  });

  it('exige mismo cardinal de medios (v_stored_count = v_sent_count) -- no basta con que los enviados matcheen si sobran/faltan', () => {
    expect(rpcSource).toMatch(/IF v_stored_count = v_sent_count AND COALESCE\(v_all_match, false\) AND v_notes_equal THEN/);
  });

  it('en la rama idempotente NO hay ningún INSERT/UPDATE antes del RETURN -- solo lee y devuelve', () => {
    const idempotentBranch = rpcSource.match(
      /IF v_session\.status = 'closed' THEN[\s\S]*?END IF;\s*\n\s*RAISE EXCEPTION 'La caja ya está cerrada con una conciliación distinta/,
    );
    expect(idempotentBranch).toBeTruthy();
    expect(idempotentBranch[0]).not.toMatch(/INSERT INTO/);
    expect(idempotentBranch[0]).not.toMatch(/UPDATE public\.crm_cash_sessions/);
  });

  it('devuelve already_closed=true en la rama idempotente', () => {
    expect(rpcSource).toMatch(/'already_closed', true/);
  });
});

describe('crm_close_cash_session — C) closed + payload distinto = error de dominio, nunca 23505', () => {
  it('lanza una excepción de dominio (23514) con HINT identificable cuando el payload no matchea', () => {
    expect(rpcSource).toMatch(
      /RAISE EXCEPTION 'La caja ya está cerrada con una conciliación distinta a la registrada' USING ERRCODE = '23514',\s*\n\s*HINT = 'crm_cash_session_closed_mismatch';/,
    );
  });

  it('nunca depende de la UNIQUE(session_id, payment_method) para detectar el reintento (ningún 23505 en el archivo)', () => {
    expect(codeOnly).not.toMatch(/23505/);
  });
});

describe('crm_close_cash_session — closed sin snapshot (cierre legado)', () => {
  it('si status=closed y no hay ninguna fila persistida, da un error claro y distinguible por HINT', () => {
    expect(rpcSource).toMatch(
      /IF v_stored_count = 0 THEN[\s\S]*?RAISE EXCEPTION 'La caja ya está cerrada' USING ERRCODE = '23514',\s*\n\s*HINT = 'crm_cash_session_closed_no_snapshot';/,
    );
  });
});

describe('crm_close_cash_session — D) open + conciliación ya persistida (estado histórico inconsistente)', () => {
  it('se detecta con EXISTS antes de cualquier INSERT, fuera de la rama closed', () => {
    const match = rpcSource.match(
      /IF EXISTS \(SELECT 1 FROM public\.crm_cash_session_reconciliations WHERE session_id = p_session_id\) THEN[\s\S]*?END IF;/,
    );
    expect(match).toBeTruthy();
    expect(match[0]).toMatch(/HINT = 'crm_cash_session_open_has_reconciliation'/);
    expect(match[0]).not.toMatch(/INSERT INTO/);
    expect(match[0]).not.toMatch(/DELETE FROM/);
  });

  it('este guard corre ANTES del cálculo de v_expected y del primer INSERT del flujo normal', () => {
    const guardIdx = rpcSource.indexOf('crm_cash_session_open_has_reconciliation');
    const expectedIdx = rpcSource.indexOf('SELECT jsonb_object_agg(method, amount) INTO v_expected');
    const insertIdx = rpcSource.indexOf('INSERT INTO public.crm_cash_session_reconciliations');
    expect(guardIdx).toBeGreaterThan(0);
    expect(expectedIdx).toBeGreaterThan(guardIdx);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });
});

describe('crm_close_cash_session — A) flujo normal sin cambios de comportamiento', () => {
  it('sigue exigiendo conciliar todo medio con actividad real calculada server-side', () => {
    expect(rpcSource).toMatch(/FOR v_method IN SELECT jsonb_object_keys\(v_expected\)/);
    expect(rpcSource).toMatch(/Falta conciliar %/);
  });

  it('sigue exigiendo observación cuando hay diferencia', () => {
    expect(rpcSource).toMatch(/Debes indicar una observación/);
  });

  it('sigue insertando una fila por medio y cerrando la sesión con closed_at/status', () => {
    expect(rpcSource).toMatch(/INSERT INTO public\.crm_cash_session_reconciliations/);
    const updateMatch = rpcSource.match(/UPDATE public\.crm_cash_sessions[\s\S]*?WHERE id = p_session_id/);
    expect(updateMatch).toBeTruthy();
    expect(updateMatch[0]).toContain('closed_at');
    expect(updateMatch[0]).toContain("status          = 'closed'");
  });

  it('el retorno normal también incluye already_closed=false (forma de respuesta consistente)', () => {
    expect(rpcSource).toMatch(/'already_closed', false/);
  });
});

describe('crm_close_cash_session — permisos (defensa en profundidad)', () => {
  it('revoca PUBLIC/anon/authenticated y otorga EXECUTE solo a authenticated -- mismo patrón que 20260921150000', () => {
    expect(codeOnly).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_close_cash_session\(UUID, JSONB, TEXT\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(codeOnly).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_close_cash_session\(UUID, JSONB, TEXT\) TO authenticated;/,
    );
  });
});

describe('guard de reapertura — trigger BEFORE UPDATE en crm_cash_sessions', () => {
  const triggerFnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.crm_cash_sessions_block_reopen_reconciled\(\)[\s\S]*?\n\$\$;/,
  );
  const triggerFnSource = triggerFnMatch ? triggerFnMatch[0] : '';

  it('la función de trigger existe y es SECURITY DEFINER con search_path fijo', () => {
    expect(triggerFnMatch).toBeTruthy();
    expect(triggerFnSource).toMatch(/RETURNS TRIGGER/);
    expect(triggerFnSource).toMatch(/SECURITY DEFINER/);
    expect(triggerFnSource).toMatch(/SET search_path = public/);
  });

  it('solo dispara en la transición hacia open (OLD.status distinto de open)', () => {
    expect(triggerFnSource).toMatch(/NEW\.status = 'open' AND OLD\.status IS DISTINCT FROM 'open'/);
  });

  it('bloquea con un error de dominio identificable por HINT cuando ya hay conciliación', () => {
    expect(triggerFnSource).toMatch(
      /RAISE EXCEPTION 'No se puede reabrir una caja que ya tiene conciliación registrada'\s*\n\s*USING ERRCODE = '23514', HINT = 'crm_cash_session_reopen_blocked_reconciled';/,
    );
  });

  it('no modifica ni borra las conciliaciones existentes -- solo las consulta con EXISTS', () => {
    expect(triggerFnSource).toMatch(/EXISTS \(SELECT 1 FROM public\.crm_cash_session_reconciliations WHERE session_id = NEW\.id\)/);
    expect(triggerFnSource).not.toMatch(/DELETE FROM/);
    expect(triggerFnSource).not.toMatch(/UPDATE public\.crm_cash_session_reconciliations/);
  });

  it('el trigger está creado sobre crm_cash_sessions, BEFORE UPDATE, FOR EACH ROW', () => {
    expect(codeOnly).toMatch(
      /CREATE TRIGGER crm_cash_sessions_block_reopen_reconciled\s+BEFORE UPDATE ON public\.crm_cash_sessions\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.crm_cash_sessions_block_reopen_reconciled\(\);/,
    );
  });

  it('el DROP TRIGGER IF EXISTS previo hace la migración segura de reaplicar', () => {
    expect(codeOnly).toMatch(/DROP TRIGGER IF EXISTS crm_cash_sessions_block_reopen_reconciled ON public\.crm_cash_sessions;/);
  });
});

describe('CAJA-CIERRE-IDEMPOTENTE-1 — no hace DML sobre datos existentes (no puede fallar por la sesión histórica inconsistente)', () => {
  it('el archivo entero no contiene ningún UPDATE/DELETE/INSERT fuera del cuerpo de las funciones (nada corre en apply-time)', () => {
    // Todo el DML vive dentro de $$ ... $$ (cuerpos de función/trigger),
    // nunca como sentencia suelta al nivel del archivo -- por eso aplicar
    // esta migración no puede tocar ni fallar por filas ya existentes,
    // incluida la sesión 576511e7-5a6b-4571-bdd9-d4702b4e2cbd.
    const withoutFunctionBodies = migrationSource.replace(/\$\$[\s\S]*?\$\$/g, '');
    expect(withoutFunctionBodies).not.toMatch(/\b(INSERT INTO|UPDATE public\.crm_cash_sessions|DELETE FROM)\b/);
  });

  it('no redefine ninguna tabla/policy/RLS existente', () => {
    expect(codeOnly).not.toMatch(/ALTER TABLE/);
    expect(codeOnly).not.toMatch(/CREATE POLICY/);
    expect(codeOnly).not.toMatch(/DROP POLICY/i);
  });

  it('recarga el schema cache de PostgREST al final', () => {
    expect(codeOnly.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});
