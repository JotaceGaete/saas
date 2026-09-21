/**
 * 20260921150000_secure_residual_hardening.sql — tests estáticos
 * (source-scan) para SEGURIDAD-WALINKA-1F.
 *
 * La verificación real contra PostgreSQL (search_path efectivo,
 * has_function_privilege antes/después, spoofing de created_by bloqueado,
 * creator_product_media cross-tenant bloqueado, matriz de crm_payments
 * sin cambios) se documenta en el informe de SEGURIDAD-WALINKA-1F -- este
 * archivo solo prueba que el SQL versionado dice lo que se supone que
 * dice, mismo criterio que 1A/1B/1C/1D/1E.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921150000_secure_residual_hardening.sql?raw';

const codeOnly = migrationSource.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

describe('SEGURIDAD-WALINKA-1F-A — search_path en las 4 funciones restantes', () => {
  it.each([
    'wa_expire_trials()',
    'wa_get_effective_plan(text, timestamptz, timestamptz)',
    'wa_plan_max_orders_per_month(text)',
    'wa_plan_max_products(text)',
  ])('%s: ALTER FUNCTION ... SET search_path = public', (sig) => {
    const re = new RegExp(`ALTER FUNCTION public\\.${sig.replace(/[()]/g, '\\$&')} SET search_path = public;`);
    expect(codeOnly).toMatch(re);
  });
});

describe('SEGURIDAD-WALINKA-1F-B — created_by := auth.uid(), nunca el parámetro', () => {
  it.each(['create_cash_movement_with_expense', 'create_cash_movement_with_purpose'])('%s: el INSERT usa auth.uid() para created_by, no p_created_by', (fn) => {
    const start = codeOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    expect(start, `no se encontró ${fn}`).toBeGreaterThan(-1);
    const end = codeOnly.indexOf('$function$;', start);
    const body = codeOnly.slice(start, end);
    expect(body).toMatch(/created_by,\s*\n\s*movement_date,.*\n?\s*\)\s*VALUES\s*\(/s);
    // El VALUES que llena la columna created_by debe usar auth.uid(), y
    // p_created_by no debe aparecer en ningún VALUES (solo en la firma).
    const valuesBlocks = body.match(/VALUES\s*\([\s\S]*?\)\s*RETURNING/g) || [];
    expect(valuesBlocks.length).toBeGreaterThan(0);
    for (const block of valuesBlocks) {
      expect(block).not.toMatch(/p_created_by/);
    }
    expect(body).toMatch(/auth\.uid\(\)/);
  });

  it('crm_cash_movements_insert: WITH CHECK exige created_by = auth.uid() además de business_id', () => {
    expect(codeOnly).toMatch(/CREATE POLICY "crm_cash_movements_insert"[\s\S]{0,300}created_by = auth\.uid\(\)/);
  });
});

describe('SEGURIDAD-WALINKA-1F-C — creator_product_media: product_id debe pertenecer al mismo creator_id', () => {
  it('WITH CHECK exige EXISTS(creator_products WHERE id=product_id AND creator_id=creator_product_media.creator_id)', () => {
    const start = codeOnly.indexOf('CREATE POLICY "creator_product_media_owner_all"');
    const end = codeOnly.indexOf(';', start);
    const body = codeOnly.slice(start, end);
    expect(body).toMatch(/WITH CHECK \(/);
    expect(body).toMatch(/is_creator_owner\(creator_id\)/);
    expect(body).toMatch(/product\.id = creator_product_media\.product_id/);
    expect(body).toMatch(/product\.creator_id = creator_product_media\.creator_id/);
  });

  it('USING no cambia (el propio creator sigue viendo/borrando sus filas, incluso inconsistentes, para poder limpiarlas)', () => {
    const start = codeOnly.indexOf('CREATE POLICY "creator_product_media_owner_all"');
    const usingIdx = codeOnly.indexOf('USING (', start);
    const withCheckIdx = codeOnly.indexOf('WITH CHECK (', start);
    const usingClause = codeOnly.slice(usingIdx, withCheckIdx);
    expect(usingClause).toBe('USING (public.is_creator_owner(creator_id))\n');
  });
});

describe('SEGURIDAD-WALINKA-1F-D — crm_payments: solo elimina las 4 policies duplicadas', () => {
  it('DROP POLICY de las 4 bare-name, nunca de las _owner_ ni admin_all', () => {
    for (const p of ['crm_payments_select', 'crm_payments_insert', 'crm_payments_update', 'crm_payments_delete']) {
      expect(codeOnly).toMatch(new RegExp(`DROP POLICY IF EXISTS "${p}" ON public\\.crm_payments;`));
    }
    for (const p of ['crm_payments_owner_select', 'crm_payments_owner_insert', 'crm_payments_owner_update', 'crm_payments_owner_delete', 'crm_payments_admin_all']) {
      expect(codeOnly).not.toMatch(new RegExp(`DROP POLICY IF EXISTS "${p}"`));
    }
  });

  it('no crea ninguna policy nueva sobre crm_payments (es limpieza, no rediseño)', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY[^;]*crm_payments/);
  });
});

describe('SEGURIDAD-WALINKA-1F-E — RPCs con grant demasiado amplio: REVOKE incluye PUBLIC, anon y authenticated', () => {
  const REVOKE_ONLY = [
    ['wa_expire_trials', '()'],
    ['wa_plan_max_orders_per_month', '(text)'],
    ['wa_plan_max_products', '(text)'],
    ['crm_take_document_number', '(uuid, text)'],
    ['crm_assert_invoice_owner', '(uuid)'],
    ['crm_insert_invoice_items', '(uuid, jsonb)'],
  ];
  const REVOKE_AND_REGRANT_AUTHENTICATED = [
    ['crm_create_invoice_document', '(uuid, jsonb, jsonb)'],
    ['crm_update_invoice_document', '(uuid, jsonb, jsonb)'],
    ['crm_create_pos_sale', '(uuid, text, jsonb, date, uuid, numeric, jsonb, text, text)'],
    ['crm_close_cash_session', '(uuid, jsonb, text)'],
  ];

  it.each([...REVOKE_ONLY, ...REVOKE_AND_REGRANT_AUTHENTICATED])('%s%s: REVOKE ALL FROM PUBLIC, anon, authenticated', (fn, sig) => {
    const escaped = sig.replace(/[()]/g, '\\$&');
    const re = new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}${escaped} FROM PUBLIC, anon, authenticated;`);
    expect(codeOnly).toMatch(re);
  });

  it.each(REVOKE_AND_REGRANT_AUTHENTICATED)('%s%s: re-otorga EXECUTE solo a authenticated (consumidor real confirmado)', (fn, sig) => {
    const escaped = sig.replace(/[()]/g, '\\$&');
    const re = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}${escaped} TO authenticated;`);
    expect(codeOnly).toMatch(re);
  });

  it.each(REVOKE_ONLY)('%s%s: sin ningún GRANT de vuelta a un rol cliente (helper 100%% interno o service_role-only)', (fn, sig) => {
    const escaped = sig.replace(/[()]/g, '\\$&');
    const grantBackRe = new RegExp(`GRANT[^;]*ON FUNCTION public\\.${fn}${escaped}[^;]*TO[^;]*(anon|authenticated)`, 'i');
    expect(codeOnly).not.toMatch(grantBackRe);
  });
});

describe('SEGURIDAD-WALINKA-1F — no toca 1E ni otras tablas fuera de este alcance', () => {
  it('no crea/altera/elimina ninguna tabla', () => {
    expect(codeOnly).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });

  it('no menciona wa_order_items ni wa_orders (alcance de 1E, no de 1F)', () => {
    expect(codeOnly).not.toMatch(/wa_order_items|wa_orders\b/);
  });
});
