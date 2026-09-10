/**
 * 20260910200000_fix_payment_confirmation_emails_legacy_columns.sql —
 * tests estáticos (source-scan) del fix de compatibilidad legacy de
 * email_queue. No hay entorno Postgres en Vitest -- mismo criterio que
 * 20260910180000_payment_confirmation_emails.test.ts.
 *
 * Reproduce el bug real de producción: email_queue.to_email/template son
 * NOT NULL sin default, y el INSERT original (20260910180000, ya
 * aplicada, NO tocada por este archivo) no los especificaba -- el INSERT
 * completo fallaba y nunca se creaba ninguna fila.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910200000_fix_payment_confirmation_emails_legacy_columns.sql?raw';

const fnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\([\s\S]*?\$\$;/,
);

describe('20260910200000 — no modifica la migración ya aplicada (180000)', () => {
  it('el archivo es CREATE OR REPLACE de la función, no un ALTER TABLE de email_queue ni un rewrite de 180000', () => {
    expect(migrationSource).not.toMatch(/ALTER TABLE public\.email_queue/);
    expect(migrationSource).not.toMatch(/DROP TABLE/i);
  });

  it('la función existe', () => {
    expect(fnMatch).not.toBeNull();
  });
});

describe('wa_enqueue_payment_confirmation_emails — compatibilidad legacy: to_email/template/payload NOT NULL', () => {
  it('el INSERT del comprador incluye to_email, template y payload (antes solo tenía business_id/type/event_key/next_attempt_at/status)', () => {
    expect(fnMatch![0]).toMatch(
      /INSERT INTO public\.email_queue \(\s*\n\s*business_id, type, event_key, next_attempt_at, status,\s*\n\s*to_email, template, payload\s*\n\s*\)/,
    );
  });

  it('to_email del comprador es EXACTAMENTE v_customer_email -- ya validado, ninguna fuente nueva ni placeholder', () => {
    expect(fnMatch![0]).toMatch(
      /VALUES \(\s*\n\s*v_business_id, 'payment_received_buyer', v_buyer_key, now\(\), 'pending',\s*\n\s*v_customer_email, 'payment_received_buyer', jsonb_build_object\('order_id', p_order_id\)\s*\n\s*\)/,
    );
  });

  it('template del comprador coincide con type (\'payment_received_buyer\') -- mismo criterio documentado para welcome/activation_24h', () => {
    const buyerInsertIdx = fnMatch![0].indexOf("'payment_received_buyer', v_buyer_key");
    expect(buyerInsertIdx).toBeGreaterThan(-1);
  });

  it('payload del comprador contiene ÚNICAMENTE order_id -- nunca montos/items/fees/PII adicional', () => {
    const buyerBlock = fnMatch![0].slice(0, fnMatch![0].indexOf('-- Comercio'));
    expect(buyerBlock).toMatch(/jsonb_build_object\('order_id', p_order_id\)/);
    expect(buyerBlock).not.toMatch(/gross_amount|total_amount|walinka_fee|mp_fee|customer_name/);
  });
});

describe('wa_enqueue_payment_confirmation_emails — resolución de email de comercio en el enqueue (nuevo, justificado por NOT NULL real)', () => {
  it('resuelve wa_businesses.email primero', () => {
    expect(fnMatch![0]).toMatch(
      /SELECT NULLIF\(trim\(b\.email\), ''\), b\.user_id\s*\n\s*INTO v_business_email, v_owner_user_id\s*\n\s*FROM public\.wa_businesses b/,
    );
  });

  it('si wa_businesses.email está vacío, hace fallback al owner en auth.users -- mismo patrón que wa_queue_welcome_email', () => {
    expect(fnMatch![0]).toMatch(
      /IF v_merchant_email IS NULL AND v_owner_user_id IS NOT NULL THEN\s*\n\s*SELECT NULLIF\(trim\(email\), ''\) INTO v_merchant_email\s*\n\s*FROM auth\.users\s*\n\s*WHERE id = v_owner_user_id;/,
    );
  });

  it('el INSERT del comercio ahora está CONDICIONADO a v_merchant_email IS NOT NULL -- ya NO se encola siempre a ciegas', () => {
    expect(fnMatch![0]).toMatch(/IF v_merchant_email IS NOT NULL THEN\s*\n\s*INSERT INTO public\.email_queue/);
  });

  it('si no hay ningún email resoluble para el comercio, NO se inserta fila -- se loguea con RAISE WARNING, sin bloquear la función', () => {
    expect(fnMatch![0]).toMatch(/ELSE\s*\n\s*RAISE WARNING 'wa_enqueue_payment_confirmation_emails: sin email de comercio resoluble/);
  });

  it('nunca inventa ni hardcodea un email placeholder para el comercio (ej. sin-email@, noreply@, placeholder@)', () => {
    expect(fnMatch![0]).not.toMatch(/sin-email@|placeholder@|noreply@|no-email@/i);
  });

  it('to_email/template del comercio usan v_merchant_email/type resuelto -- no un literal fijo', () => {
    expect(fnMatch![0]).toMatch(
      /VALUES \(\s*\n\s*v_business_id, 'payment_received_merchant', v_merchant_key, now\(\), 'pending',\s*\n\s*v_merchant_email, 'payment_received_merchant', jsonb_build_object\('order_id', p_order_id\)\s*\n\s*\)/,
    );
  });

  it('payload del comercio contiene ÚNICAMENTE order_id -- nunca montos/items/fees', () => {
    const merchantBlock = fnMatch![0].slice(fnMatch![0].indexOf('-- Comercio'));
    expect(merchantBlock).not.toMatch(/gross_amount|total_amount|walinka_fee|mp_fee/);
  });
});

describe('wa_enqueue_payment_confirmation_emails — idempotencia y permisos preservados sin cambios', () => {
  it('sigue usando event_key + ON CONFLICT (event_key) DO NOTHING para ambos INSERT', () => {
    expect(fnMatch![0]).toMatch(/'payment-confirmed:' \|\| p_order_id::text \|\| ':buyer'/);
    expect(fnMatch![0]).toMatch(/'payment-confirmed:' \|\| p_order_id::text \|\| ':merchant'/);
    expect((fnMatch![0].match(/ON CONFLICT \(event_key\) DO NOTHING/g) || []).length).toBe(2);
  });

  it('pedido inexistente sigue devolviendo false/false de forma controlada, sin lanzar', () => {
    expect(fnMatch![0]).toMatch(/RAISE WARNING 'wa_enqueue_payment_confirmation_emails: order % no existe/);
    expect(fnMatch![0]).toMatch(/RETURN QUERY SELECT false, false;/);
  });

  it('SECURITY DEFINER, search_path fijo, solo service_role -- mismos permisos que antes', () => {
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
    expect(fnMatch![0]).toMatch(/SET search_path = public/);
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) TO service_role;/,
    );
  });

  it('sigue sin recibir ningún dato de pago como parámetro -- solo p_order_id', () => {
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\(\s*\n\s*p_order_id UUID\s*\n\)/,
    );
  });
});
