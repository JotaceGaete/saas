/**
 * 20260912100000_crm_cash_sessions_payments_access_helper.sql — tests
 * estáticos (source-scan), mismo criterio que el resto de las migraciones
 * de este repo (`npx vitest run` no tiene Postgres disponible -- ver
 * 20260910220000_crm_pos_atomic_sale.test.ts y
 * 20260911010000_wa_supplier_invoices_core.test.ts para el mismo
 * criterio y su misma limitación explícita).
 *
 * TPV-BUG — esta suite prueba que el MECANISMO correcto está en el
 * archivo fuente: la función helper existe y las policies de
 * crm_cash_sessions/crm_payments la usan, que ninguna policy quedó
 * debilitada (nada de USING(true)/WITH CHECK(true) ni de bypass
 * genérico), y que la condición de autorización es exactamente la misma
 * que ya existía (mismo negocio -> mismo dueño, ningún acceso
 * cross-business).
 *
 * VALIDACIÓN REAL ADICIONAL (fuera de esta suite, no wireada a CI, mismo
 * criterio que el precedente de 20260911010000): se ejecutó este SQL
 * contra un Postgres 16 real y local de este entorno (cluster ya
 * instalado, sin relación con Supabase remoto/producción), con un
 * esquema mínimo replicando auth.users/wa_businesses/crm_cash_sessions/
 * crm_payments y `auth.uid()` simulado vía
 * `current_setting('request.jwt.claim.sub')`. Se verificó con SET ROLE +
 * SET LOCAL request.jwt.claim.sub:
 *   - el dueño real de un negocio puede INSERT en crm_cash_sessions para
 *     SU business_id;
 *   - el mismo usuario NO puede INSERT para el business_id de otro
 *     negocio (RLS lo rechaza con "new row violates row-level security
 *     policy", igual que antes de este cambio -- el límite no cambió);
 *   - sin ningún `request.jwt.claim.sub` seteado (auth.uid() = NULL,
 *     equivalente a no autenticado) el INSERT también es rechazado;
 *   - el dueño puede leer (SELECT) los crm_payments de su propio
 *     negocio y NO puede leer los de otro negocio (el otro negocio
 *     simplemente no aparece en el resultado, sin error).
 * Esa validación fue manual y ad hoc contra una base descartable -- no
 * sustituye pruebas E2E reales contra el proyecto Supabase real.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260912100000_crm_cash_sessions_payments_access_helper.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('user_can_access_business — función helper', () => {
  it('existe y es STABLE (solo lee, nunca escribe -- segura para usarse dentro de policies)', () => {
    expect(migrationSource).toMatch(/CREATE OR REPLACE FUNCTION public\.user_can_access_business\(p_business_id uuid\)/);
    expect(migrationSource).toMatch(/RETURNS boolean/);
    expect(migrationSource).toMatch(/STABLE/);
  });

  it('la condición de autorización sigue siendo exactamente "dueño del negocio" -- ni un bit más laxa', () => {
    const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.user_can_access_business[\s\S]*?\$\$;/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch[0]).toMatch(/SELECT EXISTS \(\s*\n\s*SELECT 1 FROM public\.wa_businesses\s*\n\s*WHERE id = p_business_id AND user_id = auth\.uid\(\)/);
  });

  it('deja documentado el punto de extensión para el futuro modelo de miembros/roles/cajeros', () => {
    expect(codeOnly.toLowerCase()).toMatch(/cajero/);
    expect(codeOnly.toLowerCase()).toMatch(/miembro|member/);
  });
});

describe('crm_cash_sessions — policies reasertadas', () => {
  const policyNames = ['crm_cash_sessions_select', 'crm_cash_sessions_insert', 'crm_cash_sessions_update', 'crm_cash_sessions_delete'];

  it('cada policy hace DROP IF EXISTS antes de CREATE (mismo patrón idempotente que el resto del repo)', () => {
    for (const name of policyNames) {
      expect(migrationSource).toMatch(new RegExp(`DROP POLICY IF EXISTS "${name}" ON public\\.crm_cash_sessions;`));
      expect(migrationSource).toMatch(new RegExp(`CREATE POLICY "${name}"`));
    }
  });

  it('las cuatro policies usan la función helper -- no repiten el subquery inline', () => {
    const sectionMatch = migrationSource.match(/-- ─── crm_cash_sessions[\s\S]*?-- ─── crm_payments/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch[0];
    const usages = section.match(/public\.user_can_access_business\(business_id\)/g) || [];
    // select + insert + update(using+check) + delete = 5 usos
    expect(usages.length).toBe(5);
  });

  it('INSERT y UPDATE tienen WITH CHECK (no solo USING) -- nunca se puede escribir un business_id ajeno', () => {
    const insertMatch = migrationSource.match(/CREATE POLICY "crm_cash_sessions_insert"[\s\S]*?;/);
    expect(insertMatch[0]).toMatch(/WITH CHECK \(public\.user_can_access_business\(business_id\)\)/);
    const updateMatch = migrationSource.match(/CREATE POLICY "crm_cash_sessions_update"[\s\S]*?;/);
    expect(updateMatch[0]).toMatch(/USING \(public\.user_can_access_business\(business_id\)\)/);
    expect(updateMatch[0]).toMatch(/WITH CHECK \(public\.user_can_access_business\(business_id\)\)/);
  });
});

describe('crm_payments — policies reasertadas', () => {
  const policyNames = ['crm_payments_select', 'crm_payments_insert', 'crm_payments_update', 'crm_payments_delete'];

  it('cada policy hace DROP IF EXISTS antes de CREATE', () => {
    for (const name of policyNames) {
      expect(migrationSource).toMatch(new RegExp(`DROP POLICY IF EXISTS "${name}" ON public\\.crm_payments;`));
      expect(migrationSource).toMatch(new RegExp(`CREATE POLICY "${name}"`));
    }
  });

  it('las cuatro policies usan la función helper', () => {
    const sectionMatch = migrationSource.match(/-- ─── crm_payments[\s\S]*$/);
    expect(sectionMatch).not.toBeNull();
    const usages = sectionMatch[0].match(/public\.user_can_access_business\(business_id\)/g) || [];
    expect(usages.length).toBe(5);
  });
});

describe('nunca se debilita RLS (lista de prohibiciones explícitas del bug)', () => {
  it('no hay ningún USING(true) ni WITH CHECK(true)', () => {
    expect(codeOnly).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(codeOnly).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it('no desactiva RLS en ninguna tabla', () => {
    expect(codeOnly).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it('no usa service_role en ninguna definición de policy', () => {
    expect(codeOnly.toLowerCase()).not.toContain('service_role');
  });

  it('no confía en ningún valor de negocio enviado sin verificar ownership contra auth.uid()', () => {
    // Toda referencia a business_id dentro de una policy pasa por la función
    // helper (que sí valida contra auth.uid()) -- nunca se compara
    // business_id contra una constante ni contra un valor sin filtrar.
    const policyBlocks = codeOnly.match(/CREATE POLICY "[^"]+"[\s\S]*?;/g) || [];
    expect(policyBlocks.length).toBe(8); // 4 en crm_cash_sessions + 4 en crm_payments
    for (const block of policyBlocks) {
      expect(block).toMatch(/user_can_access_business/);
    }
  });
});
