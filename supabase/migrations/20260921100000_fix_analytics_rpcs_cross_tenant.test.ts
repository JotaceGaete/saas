/**
 * 20260921100000_fix_analytics_rpcs_cross_tenant.sql — tests estáticos
 * (source-scan). Confirma que el DDL correcto existe en el archivo fuente:
 * el guard de ownership en las tres funciones, y el REVOKE/GRANT explícito
 * que deja anon sin EXECUTE y authenticated con EXECUTE.
 *
 * La verificación real contra PostgreSQL (permisos efectivos vía
 * has_function_privilege, y el comportamiento Forbidden/permitido con
 * auth.uid() simulado para negocio propio/ajeno/anon) se documenta por
 * separado en el reporte de SEGURIDAD-WALINKA-1A -- este archivo solo
 * prueba que el SQL versionado dice lo que se supone que dice, mismo
 * criterio que el resto de las migraciones de este repo.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921100000_fix_analytics_rpcs_cross_tenant.sql?raw';

const FUNCTIONS = [
  { name: 'rpc_top_products', signature: 'rpc_top_products(UUID, INT, INT)' },
  { name: 'rpc_orders_by_day', signature: 'rpc_orders_by_day(UUID, INT)' },
  { name: 'rpc_dashboard_funnel', signature: 'rpc_dashboard_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)' },
];

describe('SEGURIDAD-WALINKA-1A — guard de ownership en las 3 RPC de analítica', () => {
  it.each(FUNCTIONS)('$name: contiene el guard EXISTS(...wa_businesses...user_id = auth.uid())', ({ name }) => {
    // Cada CREATE OR REPLACE FUNCTION debe tener, en su cuerpo, el guard
    // antes de cualquier lógica de negocio -- no basta con que el guard
    // exista en algún lugar del archivo (podría estar en otra función).
    const fnStart = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(fnStart, `no se encontró CREATE OR REPLACE FUNCTION public.${name}`).toBeGreaterThan(-1);
    const fnEnd = migrationSource.indexOf('\n$$;', fnStart);
    const fnBody = migrationSource.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/IF NOT EXISTS \(\s*SELECT 1\s*FROM public\.wa_businesses\s*WHERE id = p_business_id\s*AND user_id = auth\.uid\(\)\s*\) THEN\s*RAISE EXCEPTION 'Forbidden';\s*END IF;/);
  });

  it.each(FUNCTIONS)('$name: el guard aparece ANTES de cualquier consulta a las tablas de negocio', ({ name }) => {
    const fnStart = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const fnEnd = migrationSource.indexOf('\n$$;', fnStart);
    const fnBody = migrationSource.slice(fnStart, fnEnd);
    const guardIdx = fnBody.indexOf("RAISE EXCEPTION 'Forbidden'");
    // Después del guard, en algún punto posterior debe estar el primer FROM
    // real de negocio (wa_orders/wa_order_items/wa_catalog_visits) -- si el
    // guard no aparece antes que estas tablas, no protege nada.
    const firstDataQueryIdx = fnBody.search(/FROM public\.(wa_orders|wa_order_items|wa_catalog_visits)/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(firstDataQueryIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(firstDataQueryIdx);
  });

  it.each(FUNCTIONS)('$signature: REVOKE ALL FROM PUBLIC, anon, authenticated seguido de GRANT EXECUTE solo a authenticated', ({ signature }) => {
    const revokeRe = new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated;`);
    const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')} TO authenticated;`);
    expect(migrationSource).toMatch(revokeRe);
    expect(migrationSource).toMatch(grantRe);
    // El REVOKE debe aparecer ANTES del GRANT (orden importa: si el GRANT
    // fuera primero y el REVOKE después, el resultado neto sería "sin
    // EXECUTE para nadie", rompiendo el acceso legítimo de authenticated).
    const revokeIdx = migrationSource.search(revokeRe);
    const grantIdx = migrationSource.search(grantRe);
    expect(revokeIdx).toBeLessThan(grantIdx);
  });

  it('no toca ninguna otra tabla ni función fuera de las 3 RPC de analítica', () => {
    const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/CREATE TABLE/i);
    expect(codeOnly).not.toMatch(/ALTER TABLE/i);
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(codeOnly).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(codeOnly).not.toMatch(/DELETE FROM|UPDATE public\.\w+ SET|INSERT INTO/i);
    // Únicas 3 funciones tocadas.
    const createMatches = codeOnly.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) || [];
    const names = createMatches.map(m => m.replace('CREATE OR REPLACE FUNCTION public.', ''));
    expect(new Set(names)).toEqual(new Set(['rpc_top_products', 'rpc_orders_by_day', 'rpc_dashboard_funnel']));
  });

  it('idempotente: CREATE OR REPLACE + REVOKE/GRANT explícitos, sin CREATE FUNCTION IF NOT EXISTS (que no existe en Postgres para funciones)', () => {
    // CREATE OR REPLACE FUNCTION es idempotente por naturaleza (reemplaza,
    // nunca falla si ya existe); REVOKE/GRANT explícitos también son
    // idempotentes (repetirlos dos veces deja el mismo estado final).
    expect(migrationSource.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(3);
    expect(migrationSource).not.toMatch(/CREATE FUNCTION public\.(rpc_top_products|rpc_orders_by_day|rpc_dashboard_funnel)/);
  });

  it('preserva SECURITY DEFINER y search_path fijo en las 3 funciones (mismo patrón que las funciones seguras del repo)', () => {
    const blocks = migrationSource.split('CREATE OR REPLACE FUNCTION public.').slice(1);
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).toMatch(/SECURITY DEFINER/);
      expect(block).toMatch(/SET search_path = public/);
    }
  });

  it('notifica a PostgREST para refrescar el schema cache (grants/funciones nuevas toman efecto sin restart)', () => {
    expect(migrationSource).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
  });
});
