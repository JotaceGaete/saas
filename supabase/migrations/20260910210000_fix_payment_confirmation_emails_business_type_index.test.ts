/**
 * 20260910210000_fix_payment_confirmation_emails_business_type_index.sql
 * -- tests estáticos (source-scan) del fix de índices legacy de
 * email_queue. No hay entorno Postgres en Vitest -- mismo criterio que
 * 20260910180000/20260910200000.
 *
 * Reproduce los dos bugs reales de producción:
 *   #1 ON CONFLICT (event_key) DO NOTHING sin WHERE no es inferible
 *      contra el índice parcial real idx_email_queue_event_key
 *      (WHERE event_key IS NOT NULL) -- 42P10.
 *   #2 email_queue_business_type_unique UNIQUE(business_id, type) sin
 *      WHERE bloquea la segunda venta pagada de un mismo negocio
 *      (distinto event_key, mismo business_id+type).
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910210000_fix_payment_confirmation_emails_business_type_index.sql?raw';

const fnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\([\s\S]*?\$\$;/,
);

describe('20260910210000 — no modifica 180000 ni 200000 (ya aplicadas)', () => {
  it('el archivo no reabre el CREATE TABLE de email_queue ni la lógica de 180000/200000', () => {
    expect(migrationSource).not.toMatch(/CREATE TABLE.*email_queue/i);
    expect(migrationSource).not.toMatch(/ADD COLUMN IF NOT EXISTS event_key/);
  });

  it('la función existe', () => {
    expect(fnMatch).not.toBeNull();
  });
});

describe('Bug #1 — ON CONFLICT (event_key) ahora es inferible contra el índice parcial real', () => {
  it('ambos INSERT (buyer y merchant) usan ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING', () => {
    const occurrences = fnMatch![0].match(/ON CONFLICT \(event_key\) WHERE event_key IS NOT NULL DO NOTHING/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('ya no queda ningún ON CONFLICT (event_key) DO NOTHING SIN el WHERE (ese es el que producía 42P10)', () => {
    expect(fnMatch![0]).not.toMatch(/ON CONFLICT \(event_key\) DO NOTHING/);
  });

  it('el WHERE del ON CONFLICT es textualmente idéntico al predicado real de idx_email_queue_event_key -- inferencia garantizada, no una aproximación', () => {
    expect(migrationSource).toMatch(/idx_email_queue_event_key/);
    // El predicado documentado del índice real (WHERE event_key IS NOT NULL)
    // es exactamente el mismo texto usado en el ON CONFLICT de la función.
    const indexPredicate = 'event_key IS NOT NULL';
    expect(fnMatch![0]).toMatch(new RegExp(`ON CONFLICT \\(event_key\\) WHERE ${indexPredicate} DO NOTHING`));
  });

  it('no elimina ni recrea idx_email_queue_event_key -- ese índice queda intacto, solo se corrige cómo se lo referencia', () => {
    expect(migrationSource).not.toMatch(/DROP INDEX IF EXISTS public\.idx_email_queue_event_key/);
    expect(migrationSource).not.toMatch(/CREATE (UNIQUE )?INDEX IF NOT EXISTS idx_email_queue_event_key/);
  });
});

describe('Bug #2 — email_queue_business_type_unique ya no bloquea ventas repetidas del mismo negocio', () => {
  it('hace DROP de ambos nombres posibles del índice legacy (drift de nombre entre repo y producción)', () => {
    expect(migrationSource).toMatch(/DROP INDEX IF EXISTS public\.email_queue_business_type_unique;/);
    expect(migrationSource).toMatch(/DROP INDEX IF EXISTS public\.idx_email_queue_business_type;/);
  });

  it('recrea el índice sobre las MISMAS columnas (business_id, type) -- no cambia la forma, solo el alcance', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_business_type\s*\n\s*ON public\.email_queue \(business_id, type\)/,
    );
  });

  it('excluye ÚNICAMENTE payment_received_buyer y payment_received_merchant del predicado -- nada más', () => {
    const match = migrationSource.match(
      /ON public\.email_queue \(business_id, type\)\s*\n\s*WHERE type NOT IN \(([^)]+)\);/,
    );
    expect(match).not.toBeNull();
    const excludedTypes = match![1].split(',').map((s) => s.trim());
    expect(excludedTypes).toEqual(["'payment_received_buyer'", "'payment_received_merchant'"]);
  });

  it('NO agrega business_id IS NOT NULL al predicado -- evaluado y descartado (NULL nunca colisiona consigo mismo en UNIQUE, sería redundante)', () => {
    const indexBlock = migrationSource.slice(
      migrationSource.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_business_type'),
      migrationSource.indexOf('COMMENT ON INDEX'),
    );
    expect(indexBlock).not.toMatch(/business_id IS NOT NULL/);
  });

  it('mismo business_id, dos pedidos distintos de comprador (event_key distinto) -- el índice nuevo no los cubre, event_key sí distingue cada uno', () => {
    // Invariante estructural: el arbiter usado por el INSERT de buyer es
    // event_key (Bug #1), nunca (business_id, type) -- así que dos filas
    // payment_received_buyer del mismo negocio con distinto event_key
    // nunca compiten por el mismo arbiter, y el índice business_type ya
    // no las incluye (predicado del test anterior). Confirmamos ambas
    // mitades de esa garantía en un solo lugar.
    const buyerInsertBlock = fnMatch![0].slice(
      fnMatch![0].indexOf("'payment_received_buyer', v_buyer_key"),
      fnMatch![0].indexOf('-- Comercio'),
    );
    expect(buyerInsertBlock).toMatch(/ON CONFLICT \(event_key\) WHERE event_key IS NOT NULL DO NOTHING/);
    expect(buyerInsertBlock).not.toMatch(/ON CONFLICT \(business_id, type\)/);
  });

  it('mismo business_id, dos pedidos distintos de comercio (event_key distinto) -- misma garantía que buyer', () => {
    const merchantInsertBlock = fnMatch![0].slice(fnMatch![0].indexOf('-- Comercio'));
    expect(merchantInsertBlock).toMatch(/ON CONFLICT \(event_key\) WHERE event_key IS NOT NULL DO NOTHING/);
    expect(merchantInsertBlock).not.toMatch(/ON CONFLICT \(business_id, type\)/);
  });
});

describe('Protección legacy preservada -- welcome/activation_24h/news/new_order/onboarding_tip_* siguen únicos por (business_id, type)', () => {
  it('no toca wa_queue_welcome_email ni wa_schedule_activation_24h_email -- hoy son no-ops (20260510000000), sin INSERT activo que ajustar', () => {
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.wa_queue_welcome_email/);
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.wa_schedule_activation_24h_email/);
  });

  it('documenta el riesgo a futuro si esa automatización se reactiva sin actualizar su ON CONFLICT', () => {
    expect(migrationSource).toMatch(/RIESGO A FUTURO/);
    expect(migrationSource).toMatch(/EMAIL_AUTOMATION_ENABLED/);
  });

  it('el índice sigue siendo UNIQUE (no se debilita a un índice no-único ni se elimina la protección)', () => {
    expect(migrationSource).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_business_type/);
  });
});

describe('Seguridad y permisos preservados sin cambios', () => {
  it('SECURITY DEFINER, search_path fijo -- iguales a 2A', () => {
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
    expect(fnMatch![0]).toMatch(/SET search_path = public/);
  });

  it('REVOKE/GRANT idénticos a 2A -- no se amplía acceso a ningún rol cliente', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) TO service_role;/,
    );
    expect(migrationSource).not.toMatch(/GRANT[^;]*TO (anon|authenticated|PUBLIC)/);
  });

  it('no toca RLS de ninguna tabla (sin ENABLE/DISABLE ROW LEVEL SECURITY, sin CREATE POLICY)', () => {
    expect(migrationSource).not.toMatch(/ROW LEVEL SECURITY/);
    expect(migrationSource).not.toMatch(/CREATE POLICY/);
  });

  it('event_key sigue sin tocarse a nivel de columna -- no ALTER COLUMN, no se relaja ninguna restricción existente', () => {
    expect(migrationSource).not.toMatch(/ALTER COLUMN event_key/);
    expect(migrationSource).not.toMatch(/DROP CONSTRAINT/);
  });
});

describe('Contenido preservado de EMAIL-PAYMENTS-2A (buyer/merchant sin regresiones)', () => {
  it('buyer: valida customer_email, to_email real, template=type, payload.order_id', () => {
    expect(fnMatch![0]).toMatch(/v_customer_email ~ '\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$'/);
    expect(fnMatch![0]).toMatch(
      /v_business_id, 'payment_received_buyer', v_buyer_key, now\(\), 'pending',\s*\n\s*v_customer_email, 'payment_received_buyer', jsonb_build_object\('order_id', p_order_id\)/,
    );
  });

  it('merchant: resuelve wa_businesses.email con fallback a auth.users del owner, sin placeholder, no inserta si no hay email', () => {
    expect(fnMatch![0]).toMatch(/FROM public\.wa_businesses b/);
    expect(fnMatch![0]).toMatch(/FROM auth\.users\s*\n\s*WHERE id = v_owner_user_id/);
    expect(fnMatch![0]).toMatch(/IF v_merchant_email IS NOT NULL THEN/);
    expect(fnMatch![0]).not.toMatch(/sin-email@|placeholder@|noreply@|no-email@/i);
  });

  it('sigue sin recibir ningún dato de pago como parámetro -- solo p_order_id', () => {
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\(\s*\n\s*p_order_id UUID\s*\n\)/,
    );
  });
});
