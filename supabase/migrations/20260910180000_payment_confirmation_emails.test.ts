/**
 * 20260910180000_payment_confirmation_emails.sql — tests estáticos
 * (source-scan) del modelo de cola para emails de pago: event_key,
 * wa_claim_email_queue_batch (claim atómico) y
 * wa_enqueue_payment_confirmation_emails (productor idempotente). No hay
 * entorno Postgres en Vitest -- mismo criterio que
 * 20260910170000_merchant_order_payments.test.ts.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910180000_payment_confirmation_emails.sql?raw';

describe('email_queue — event_key (idempotencia por evento, no por negocio)', () => {
  it('agrega event_key nullable -- nunca rompe filas históricas sin event_key', () => {
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS event_key\s+TEXT NULL/);
  });

  it('índice UNIQUE parcial sobre event_key, solo cuando no es NULL', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_event_key\s*\n\s*ON public\.email_queue \(event_key\)\s*\n\s*WHERE event_key IS NOT NULL;/,
    );
  });

  it('no reutiliza ni modifica UNIQUE(business_id, type) -- ese sigue siendo el de welcome/activation_24h', () => {
    expect(migrationSource).not.toMatch(/DROP.*business_id.*type/i);
    expect(migrationSource).not.toMatch(/idx_email_queue_business_type/);
  });

  it('amplía el status CHECK para incluir processing, preservando pending/sent/failed', () => {
    expect(migrationSource).toMatch(
      /CHECK \(status IN \('pending', 'processing', 'sent', 'failed'\)\)/,
    );
  });
});

describe('wa_claim_email_queue_batch — claim atómico contra concurrencia', () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.wa_claim_email_queue_batch\([\s\S]*?\$\$;/,
  );

  it('la función existe', () => {
    expect(fnMatch).not.toBeNull();
  });

  it('usa FOR UPDATE SKIP LOCKED -- dos workers concurrentes nunca reclaman la misma fila', () => {
    expect(fnMatch![0]).toMatch(/FOR UPDATE OF candidate SKIP LOCKED/);
  });

  it('reclama pending listos, failed reintentables (retry_count < 3) y processing abandonados por staleness', () => {
    expect(fnMatch![0]).toMatch(/candidate\.status = 'pending'/);
    expect(fnMatch![0]).toMatch(/candidate\.status = 'failed'\s*\n\s*AND candidate\.retry_count < 3/);
    expect(fnMatch![0]).toMatch(/candidate\.status = 'processing'/);
    expect(fnMatch![0]).toMatch(/claimed_at < now\(\) - make_interval\(mins => p_stale_minutes\)/);
  });

  it('transiciona a processing y marca claimed_at al reclamar', () => {
    expect(fnMatch![0]).toMatch(/SET status = 'processing', claimed_at = now\(\)/);
  });

  it('SECURITY DEFINER, solo service_role -- ningún cliente/frontend puede reclamar directamente', () => {
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_claim_email_queue_batch\(INTEGER, INTEGER, BOOLEAN, BOOLEAN\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_claim_email_queue_batch\(INTEGER, INTEGER, BOOLEAN, BOOLEAN\) TO service_role;/,
    );
  });
});

describe('wa_claim_email_queue_batch — filtro por categoría (EMAIL-PAYMENTS-1, separación de flags)', () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.wa_claim_email_queue_batch\([\s\S]*?\$\$;/,
  );

  it('acepta p_include_payment_types y p_include_legacy_types, ambos default true (preserva "reclamar todo" si nadie los pasa)', () => {
    expect(fnMatch![0]).toMatch(/p_include_payment_types\s+BOOLEAN DEFAULT true/);
    expect(fnMatch![0]).toMatch(/p_include_legacy_types\s+BOOLEAN DEFAULT true/);
  });

  it('filtra payment_received_buyer/merchant solo si p_include_payment_types es true', () => {
    expect(fnMatch![0]).toMatch(
      /candidate\.type IN \('payment_received_buyer', 'payment_received_merchant'\)\s*\n\s*AND p_include_payment_types/,
    );
  });

  it('filtra todo lo que NO sea de pago (welcome/activation_24h/futuros tipos legacy) solo si p_include_legacy_types es true', () => {
    expect(fnMatch![0]).toMatch(
      /candidate\.type NOT IN \('payment_received_buyer', 'payment_received_merchant'\)\s*\n\s*AND p_include_legacy_types/,
    );
  });

  it('el filtro de categoría es un AND separado de la elegibilidad por tiempo/estado -- no reemplaza ni debilita esa lógica', () => {
    const categoryFilterIdx = fnMatch![0].indexOf('p_include_payment_types');
    const statusEligibilityIdx = fnMatch![0].indexOf("candidate.status = 'pending'");
    expect(categoryFilterIdx).toBeGreaterThan(-1);
    expect(statusEligibilityIdx).toBeGreaterThan(-1);
    expect(categoryFilterIdx).toBeLessThan(statusEligibilityIdx);
  });

  it('no cambia el locking (sigue siendo un único FOR UPDATE SKIP LOCKED sobre el mismo candidate)', () => {
    expect((fnMatch![0].match(/FOR UPDATE/g) || []).length).toBe(1);
  });
});

describe('wa_enqueue_payment_confirmation_emails — productor idempotente', () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\([\s\S]*?\$\$;/,
  );

  it('la función existe y recibe solo p_order_id -- ningún otro dato de pago llega como parámetro', () => {
    expect(fnMatch).not.toBeNull();
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.wa_enqueue_payment_confirmation_emails\(\s*\n\s*p_order_id UUID\s*\n\)/,
    );
  });

  it('relee business_id/customer_email desde wa_orders server-side -- nunca los recibe como parámetro', () => {
    expect(fnMatch![0]).toMatch(/FROM public\.wa_orders o\s*\n\s*WHERE o\.id = p_order_id/);
  });

  it('valida el email del comprador con una regex simple antes de encolar -- nunca inventa ni asume válido', () => {
    expect(fnMatch![0]).toMatch(/v_customer_email ~ '\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$'/);
  });

  it('el email de comercio SIEMPRE se intenta encolar (no depende de que exista wa_businesses.email -- eso lo resuelve process-email-queue con fallback)', () => {
    const buyerIdx = fnMatch![0].indexOf("'payment_received_buyer'");
    const merchantIdx = fnMatch![0].indexOf("'payment_received_merchant'");
    expect(buyerIdx).toBeGreaterThan(-1);
    expect(merchantIdx).toBeGreaterThan(-1);
    // El INSERT de merchant no está condicionado por ningún IF previo (a
    // diferencia del de buyer, que sí lo está).
    const merchantBlock = fnMatch![0].slice(buyerIdx, merchantIdx + 40);
    expect(merchantBlock).toMatch(/END IF;/); // cierra el bloque IF del buyer antes de merchant
  });

  it('usa event_key = payment-confirmed:<order_id>:buyer/:merchant + ON CONFLICT DO NOTHING -- retry del webhook nunca duplica', () => {
    expect(fnMatch![0]).toMatch(/'payment-confirmed:' \|\| p_order_id::text \|\| ':buyer'/);
    expect(fnMatch![0]).toMatch(/'payment-confirmed:' \|\| p_order_id::text \|\| ':merchant'/);
    expect((fnMatch![0].match(/ON CONFLICT \(event_key\) DO NOTHING/g) || []).length).toBe(2);
  });

  it('pedido inexistente no lanza excepción -- devuelve false/false de forma controlada', () => {
    expect(fnMatch![0]).toMatch(/RAISE WARNING 'wa_enqueue_payment_confirmation_emails: order % no existe/);
    expect(fnMatch![0]).toMatch(/RETURN QUERY SELECT false, false;/);
  });

  it('SECURITY DEFINER, solo service_role -- el frontend nunca puede encolar directamente ni falsificar destinatarios', () => {
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_enqueue_payment_confirmation_emails\(UUID\) TO service_role;/,
    );
  });

  it('el payload guardado en email_queue no incluye montos/items/fees -- solo identidad mínima (business_id/type/event_key)', () => {
    expect(fnMatch![0]).not.toMatch(/gross_amount|total_amount|walinka_fee|mp_fee/);
  });
});
