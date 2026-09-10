/**
 * 20260910130000_merchant_mp_checkout_core.sql — tests estáticos
 * (source-scan) de los REVOKE/grants. No hay entorno Postgres en
 * Vitest, así que esto NO ejecuta la migración ni reemplaza el
 * dry-run manual contra un scratch Postgres -- solo guarda contra una
 * regresión textual obvia (alguien agrega un GRANT a
 * authenticated/anon sin querer, o una de las 2 RPCs deja de ser
 * service_role-only).
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910130000_merchant_mp_checkout_core.sql?raw';

describe('wa_get_mp_connection_for_checkout — service_role-only, nunca refresh_token', () => {
  it('revoca todo acceso a PUBLIC, anon y authenticated', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_get_mp_connection_for_checkout\(UUID\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it('no existe ningún GRANT EXECUTE de esta función a authenticated ni anon', () => {
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_get_mp_connection_for_checkout[^;]*TO (authenticated|anon)/);
  });

  it('usa wa_mp_connection_encryption_key() y pgp_sym_decrypt sobre access_token_ciphertext', () => {
    expect(migrationSource).toMatch(/v_key\s*:=\s*public\.wa_mp_connection_encryption_key\(\)/);
    expect(migrationSource).toMatch(/pgp_sym_decrypt\(mc\.access_token_ciphertext,\s*v_key\)/);
  });

  it('nunca descifra ni devuelve refresh_token_ciphertext', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_get_mp_connection_for_checkout[\s\S]*?^\$\$;/m,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/refresh_token/);
  });

  it('solo devuelve conexiones con status=\'connected\'', () => {
    expect(migrationSource).toMatch(/WHERE mc\.business_id = p_business_id\s*\n\s*AND mc\.status = 'connected'/);
  });

  it('es SECURITY DEFINER con search_path fijo', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_get_mp_connection_for_checkout[\s\S]*?SET search_path = public, extensions/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
  });
});

describe('wa_create_merchant_checkout_order — service_role-only, atómica', () => {
  it('revoca todo acceso a PUBLIC, anon y authenticated', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_create_merchant_checkout_order\(\s*\n\s*UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB\s*\n\)\s*FROM PUBLIC, anon, authenticated/,
    );
  });

  it('no existe ningún GRANT EXECUTE de esta función a authenticated ni anon', () => {
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_create_merchant_checkout_order[^;]*TO (authenticated|anon)/);
  });

  it('payment_status siempre se inserta como \'pendiente\' -- no es un parámetro de la función', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_create_merchant_checkout_order[\s\S]*?^\$\$;/m,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/p_payment_status/);
    expect(fnMatch![0]).toMatch(/'pendiente'/);
  });

  it('inserta wa_orders y wa_order_items dentro de la misma función (atómico por construcción)', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_create_merchant_checkout_order[\s\S]*?^\$\$;/m,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/INSERT INTO public\.wa_orders/);
    expect(fnMatch![0]).toMatch(/INSERT INTO public\.wa_order_items/);
  });

  it('rechaza carrito vacío antes de crear cualquier fila', () => {
    expect(migrationSource).toMatch(/EMPTY_CART/);
    const insertOrderIdx = migrationSource.indexOf('INSERT INTO public.wa_orders');
    const emptyCartIdx = migrationSource.indexOf('EMPTY_CART');
    expect(emptyCartIdx).toBeGreaterThan(-1);
    expect(insertOrderIdx).toBeGreaterThan(-1);
    expect(emptyCartIdx).toBeLessThan(insertOrderIdx);
  });

  it('es SECURITY DEFINER con search_path fijo', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_create_merchant_checkout_order[\s\S]*?SET search_path = public, extensions/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
  });
});

describe('no crea tablas nuevas ni toca billing', () => {
  it('no contiene ningún CREATE TABLE', () => {
    expect(migrationSource).not.toMatch(/CREATE TABLE/);
  });

  it('no contiene SQL real (INSERT/UPDATE/SELECT/REFERENCES) sobre wa_payments, wa_payment_events o billing_subscriptions -- solo pueden aparecer en prosa/comentarios explicando el aislamiento', () => {
    expect(migrationSource).not.toMatch(/(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.(wa_payments|wa_payment_events|billing_subscriptions)\b/i);
  });

  it('no otorga ningún GRANT/acceso nuevo sobre mp_connections, wa_payments ni billing_subscriptions', () => {
    expect(migrationSource).not.toMatch(/GRANT[^;]*ON\s+(TABLE\s+)?public\.(mp_connections|wa_payments|billing_subscriptions)\b/i);
  });
});
