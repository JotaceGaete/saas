/**
 * 20260921110000_fix_plan_admin_rpcs_authorization.sql — tests estáticos
 * (source-scan). Confirma que el DDL correcto existe en el archivo fuente
 * para las 6 funciones de SEGURIDAD-WALINKA-1B.
 *
 * La verificación real contra PostgreSQL (permisos efectivos vía
 * has_function_privilege, comportamiento Forbidden/permitido/permission
 * denied para dueño/cross-tenant/admin/usuario normal/anon, y la prueba de
 * que el trigger interno de wa_admin_notify sigue funcionando) se
 * documenta en el reporte de SEGURIDAD-WALINKA-1B y vive en
 * supabase/diagnostics/verify_plan_admin_rpcs_authorization.sql -- este
 * archivo solo prueba que el SQL versionado dice lo que se supone que
 * dice, mismo criterio que 20260921100000_fix_analytics_rpcs_cross_tenant.test.ts.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921110000_fix_plan_admin_rpcs_authorization.sql?raw';

function extractFunctionBody(name: string): string {
  const start = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `no se encontró CREATE OR REPLACE FUNCTION public.${name}`).toBeGreaterThan(-1);
  const end = migrationSource.indexOf('\n$$;', start);
  return migrationSource.slice(start, end);
}

describe('SEGURIDAD-WALINKA-1B — PLAN RPCs: guard de ownership', () => {
  it('wa_get_plan_usage: guard dueño O admin (tiene consumidor admin real)', () => {
    const body = extractFunctionBody('wa_get_plan_usage');
    expect(body).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM public\.wa_businesses\s*WHERE id = p_business_id AND user_id = auth\.uid\(\)\s*\) AND NOT public\.wa_is_admin\(\) THEN\s*RAISE EXCEPTION 'Forbidden';\s*END IF;/);
  });

  it.each(['wa_check_order_limit', 'wa_check_product_limit'])('%s: guard solo dueño (sin excepción admin, sin consumidor admin conocido)', (name) => {
    const body = extractFunctionBody(name);
    expect(body).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM public\.wa_businesses\s*WHERE id = p_business_id AND user_id = auth\.uid\(\)\s*\) THEN\s*RAISE EXCEPTION 'Forbidden';\s*END IF;/);
    // No debe tener la excepción de admin -- a diferencia de wa_get_plan_usage.
    expect(body).not.toMatch(/wa_is_admin/);
  });

  it.each(['wa_get_plan_usage', 'wa_check_order_limit', 'wa_check_product_limit'])('%s: el guard aparece ANTES de cualquier SELECT sobre wa_products/wa_orders', (name) => {
    const body = extractFunctionBody(name);
    const guardIdx = body.indexOf("RAISE EXCEPTION 'Forbidden'");
    const dataQueryIdx = body.search(/SELECT (COUNT|plan_slug)/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dataQueryIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(dataQueryIdx);
  });
});

describe('SEGURIDAD-WALINKA-1B — ADMIN RPCs: gate wa_is_admin()', () => {
  it.each(['wa_admin_plan_stats', 'wa_admin_suspicious_businesses'])('%s: gate wa_is_admin() antes de cualquier lógica', (name) => {
    const body = extractFunctionBody(name);
    expect(body).toMatch(/IF NOT public\.wa_is_admin\(\) THEN\s*RAISE EXCEPTION 'Forbidden';\s*END IF;/);
    const guardIdx = body.indexOf("RAISE EXCEPTION 'Forbidden'");
    const dataQueryIdx = body.search(/FOR v_row IN|SELECT jsonb_agg/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dataQueryIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(dataQueryIdx);
  });

  it('wa_admin_notify: NO tiene gate interno de wa_is_admin()/auth.uid() -- el guard es solo de GRANT (rompería el trigger de wa_payments si lo tuviera)', () => {
    const start = migrationSource.indexOf('-- ── wa_admin_notify:');
    const end = migrationSource.indexOf("NOTIFY pgrst");
    const section = migrationSource.slice(start, end);
    // No debe haber invocación FUNCIONAL de wa_is_admin()/auth.uid() (ej.
    // dentro de un IF): los comentarios `--` y el texto en prosa de
    // COMMENT ON FUNCTION sí mencionan ambos términos a propósito (para
    // documentar por qué NO se agregó el gate), así que se descartan
    // explícitamente esos dos patrones -- solo se prueba ausencia de código
    // ejecutable que los invoque.
    expect(section).not.toMatch(/IF NOT public\.wa_is_admin\(\)/);
    expect(section).not.toMatch(/AND user_id = auth\.uid\(\)/);
    // Debe seguir sin ningún CREATE OR REPLACE FUNCTION (no se tocó el
    // cuerpo, solo GRANT/REVOKE/COMMENT).
    const codeOnly = section.split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/CREATE OR REPLACE FUNCTION/);
  });
});

describe('SEGURIDAD-WALINKA-1B — grants explícitos', () => {
  const grantedToAuthenticatedOnly = [
    { signature: 'wa_get_plan_usage(uuid)' },
    { signature: 'wa_check_order_limit(uuid)' },
    { signature: 'wa_check_product_limit(uuid)' },
    { signature: 'wa_admin_plan_stats()' },
    { signature: 'wa_admin_suspicious_businesses()' },
  ];

  it.each(grantedToAuthenticatedOnly)('$signature: REVOKE ALL FROM PUBLIC, anon, authenticated seguido de GRANT EXECUTE solo a authenticated', ({ signature }) => {
    const esc = signature.replace(/[()]/g, '\\$&');
    const revokeRe = new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`);
    const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated;`);
    expect(migrationSource).toMatch(revokeRe);
    expect(migrationSource).toMatch(grantRe);
    expect(migrationSource.search(revokeRe)).toBeLessThan(migrationSource.search(grantRe));
  });

  it('wa_admin_notify(text, text, text, jsonb): REVOKE ALL sin ningún GRANT de reemplazo a rol cliente', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.wa_admin_notify\(text, text, text, jsonb\) FROM PUBLIC, anon, authenticated;/);
    // No debe haber ningún GRANT EXECUTE sobre wa_admin_notify en todo el archivo.
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_admin_notify/);
  });
});

describe('SEGURIDAD-WALINKA-1B — search_path fijo en las 5 funciones cuyo cuerpo se reemplaza', () => {
  it.each(['wa_get_plan_usage', 'wa_check_order_limit', 'wa_check_product_limit', 'wa_admin_plan_stats', 'wa_admin_suspicious_businesses'])('%s: SET search_path = public', (name) => {
    const body = extractFunctionBody(name);
    expect(body).toMatch(/SET search_path = public/);
    expect(body).toMatch(/SECURITY DEFINER/);
  });
});

describe('SEGURIDAD-WALINKA-1B — alcance de la migración', () => {
  it('toca exactamente las 6 funciones del ticket, ninguna otra', () => {
    const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    const createMatches = codeOnly.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) || [];
    const names = createMatches.map(m => m.replace('CREATE OR REPLACE FUNCTION public.', ''));
    // wa_admin_notify no tiene CREATE OR REPLACE (solo REVOKE/COMMENT) -- 5 con cuerpo reemplazado.
    expect(new Set(names)).toEqual(new Set(['wa_get_plan_usage', 'wa_check_order_limit', 'wa_check_product_limit', 'wa_admin_plan_stats', 'wa_admin_suspicious_businesses']));
  });

  it('no toca tablas, policies ni RLS -- solo funciones y sus grants', () => {
    const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/CREATE TABLE/i);
    expect(codeOnly).not.toMatch(/ALTER TABLE/i);
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(codeOnly).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(codeOnly).not.toMatch(/DELETE FROM|INSERT INTO/i);
  });

  it('notifica a PostgREST para refrescar el schema cache', () => {
    expect(migrationSource).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
  });
});
