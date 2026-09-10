/**
 * 20260910150000_merchant_mp_public_availability.sql — tests estáticos
 * (source-scan). No hay entorno Postgres en Vitest -- ver el dry-run
 * manual documentado en el reporte de MP-CHECKOUT-3.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910150000_merchant_mp_public_availability.sql?raw';

describe('wa_get_public_merchant_mp_availability — único RPC intencionalmente público', () => {
  it('otorga EXECUTE a anon (a propósito, distinto del resto de RPCs de MP-OAUTH/MP-CHECKOUT)', () => {
    expect(migrationSource).toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_get_public_merchant_mp_availability\(TEXT\) TO anon, authenticated/);
  });

  it('no contiene ningún REVOKE (a diferencia de las RPCs sensibles de MP-OAUTH/MP-CHECKOUT)', () => {
    expect(migrationSource).not.toMatch(/REVOKE/);
  });

  it('devuelve EXCLUSIVAMENTE un booleano -- RETURNS TABLE (available BOOLEAN)', () => {
    expect(migrationSource).toMatch(/RETURNS TABLE \(available BOOLEAN\)/);
  });

  it('nunca selecciona ni devuelve business_id, provider_user_id, access_token_ciphertext ni refresh_token_ciphertext', () => {
    const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_get_public_merchant_mp_availability[\s\S]*?^\$\$;/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/provider_user_id|access_token|refresh_token/);
    // v_business.id se usa internamente para el EXISTS contra mp_connections,
    // pero nunca aparece en ningún RETURN QUERY SELECT.
    expect(fnMatch![0]).not.toMatch(/RETURN QUERY SELECT[^;]*v_business\.id/);
  });

  it('solo considera CL/AR (mismo conjunto que MP-OAUTH), sin fuzzy matching contra wa_businesses.country', () => {
    expect(migrationSource).toMatch(/v_country NOT IN \('CL', 'AR'\)/);
    expect(migrationSource).not.toMatch(/\.country\b(?!_code)/);
  });

  it('exige status=\'connected\' en mp_connections, no solo que exista la fila', () => {
    expect(migrationSource).toMatch(/AND status = 'connected'/);
  });

  it('exige is_active en wa_businesses', () => {
    expect(migrationSource).toMatch(/NOT FOUND OR NOT v_business\.is_active/);
  });

  it('es SECURITY DEFINER con search_path fijo', () => {
    const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_get_public_merchant_mp_availability[\s\S]*?SET search_path = public/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
  });
});

describe('no crea tablas nuevas ni toca billing/MP-OAUTH', () => {
  it('no contiene ningún CREATE TABLE ni ALTER TABLE', () => {
    expect(migrationSource).not.toMatch(/CREATE TABLE/);
    expect(migrationSource).not.toMatch(/ALTER TABLE/);
  });

  it('no contiene SQL real sobre wa_payments, wa_payment_events, billing_subscriptions ni crm_payments', () => {
    expect(migrationSource).not.toMatch(/(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.(wa_payments|wa_payment_events|billing_subscriptions|crm_payments)\b/i);
  });
});
