/**
 * 20260921140000_secure_order_items_and_storage_policies.sql — tests
 * estáticos (source-scan) para SEGURIDAD-WALINKA-1E.
 *
 * La verificación real contra PostgreSQL (checkout público atómico,
 * inyección cross-order rechazada, límite de plan preservado, y las
 * policies de Storage antes/después) se documenta en el informe de
 * SEGURIDAD-WALINKA-1E -- este archivo solo prueba que el SQL versionado
 * dice lo que se supone que dice, mismo criterio que 1A/1B/1C/1D.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921140000_secure_order_items_and_storage_policies.sql?raw';

const codeOnly = migrationSource.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

describe('SEGURIDAD-WALINKA-1E-A — wa_order_items: RPC atómica reemplaza WITH CHECK(true)', () => {
  it('crea wa_create_order_with_items() SECURITY DEFINER', () => {
    expect(codeOnly).toMatch(/CREATE OR REPLACE FUNCTION public\.wa_create_order_with_items\(/);
    const start = codeOnly.indexOf('CREATE OR REPLACE FUNCTION public.wa_create_order_with_items(');
    const end = codeOnly.indexOf('\n$$;', start);
    const body = codeOnly.slice(start, end);
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it('inserta wa_orders y wa_order_items dentro de la misma función (atómico)', () => {
    const start = codeOnly.indexOf('CREATE OR REPLACE FUNCTION public.wa_create_order_with_items(');
    const end = codeOnly.indexOf('\n$$;', start);
    const body = codeOnly.slice(start, end);
    expect(body).toMatch(/INSERT INTO public\.wa_orders/);
    expect(body).toMatch(/INSERT INTO public\.wa_order_items/);
    expect(body).toMatch(/RETURNING id INTO v_order_id/);
    // El order_id que reciben los items es el que la propia función generó
    // (v_order_id), nunca un id recibido como parámetro -- así no existe
    // ninguna vía para "adjuntar" items a un pedido preexistente ajeno.
    expect(body).not.toMatch(/p_order_id/);
  });

  it('GRANT EXECUTE a anon y authenticated (checkout público)', () => {
    expect(codeOnly).toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_create_order_with_items\([^)]*\)\s*TO anon, authenticated;/);
  });

  it('elimina wa_order_items_anon_insert (la policy WITH CHECK(true))', () => {
    expect(codeOnly).toMatch(/DROP POLICY IF EXISTS "wa_order_items_anon_insert" ON public\.wa_order_items;/);
  });

  it('NO toca wa_orders_anon_insert (fuera del alcance nombrado por el ticket)', () => {
    expect(codeOnly).not.toMatch(/wa_orders_anon_insert/);
  });

  it('no crea ninguna policy nueva sobre wa_order_items (el cierre es total, no una policy con ownership)', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY[^;]*wa_order_items/);
  });
});

describe('SEGURIDAD-WALINKA-1E-B — Storage: cierra escritura de cliente en los 3 buckets', () => {
  const BUCKETS = ['wa_product_images', 'wa_business_logos', 'wa_business_covers'];

  it.each(BUCKETS)('%s: elimina las policies _auth_upload y _auth_delete', (prefix) => {
    expect(codeOnly).toMatch(new RegExp(`DROP POLICY IF EXISTS "${prefix}_auth_upload" ON storage\\.objects;`));
    expect(codeOnly).toMatch(new RegExp(`DROP POLICY IF EXISTS "${prefix}_auth_delete" ON storage\\.objects;`));
  });

  it.each(BUCKETS)('%s: NO toca la policy _public_read (lectura pública histórica se preserva)', (prefix) => {
    expect(codeOnly).not.toMatch(new RegExp(`${prefix}_public_read`));
  });

  it('no crea ninguna policy nueva de INSERT/UPDATE/DELETE sobre storage.objects (sin consumidor de escritura vivo que preservar)', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY[^;]*ON storage\.objects/);
  });

  it('no borra buckets ni objetos', () => {
    expect(codeOnly).not.toMatch(/DELETE FROM storage\.objects/i);
    expect(codeOnly).not.toMatch(/DELETE FROM storage\.buckets/i);
    expect(codeOnly).not.toMatch(/DROP.*storage\.buckets/i);
  });
});

describe('SEGURIDAD-WALINKA-1E — no toca 1F ni nada fuera de este alcance', () => {
  it('no crea ni altera ninguna otra tabla', () => {
    expect(codeOnly).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });
});
