/**
 * 20260921160000_secure_checkout_price_integrity.sql — tests estáticos
 * (source-scan) para SEGURIDAD-WALINKA-2.
 *
 * La verificación real contra PostgreSQL (matriz de 14 casos BEFORE/AFTER:
 * precio manipulado, subtotal manipulado, total manipulado, cantidad
 * inválida, cross-business, producto inexistente/inactivo, negocio
 * inactivo, carrito vacío, stock insuficiente, currency manipulada, bypass
 * directo de wa_orders) se documenta en el informe local de
 * SEGURIDAD-WALINKA-2 -- este archivo solo prueba que el SQL versionado
 * dice lo que se supone que dice, mismo criterio que 1A-1F.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921160000_secure_checkout_price_integrity.sql?raw';

const codeOnly = migrationSource.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

function functionBody(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `no se encontró ${name}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n$$;', start);
  expect(end, `no se encontró el fin de ${name}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('SEGURIDAD-WALINKA-2 — wa_create_order_with_items: precio/subtotal/total nunca vienen del cliente', () => {
  const body = functionBody(codeOnly, 'wa_create_order_with_items');

  it('el INSERT de wa_order_items usa v_product.price/v_product.name, nunca product_price/subtotal/product_name del item recibido', () => {
    const insertStart = body.indexOf('INSERT INTO public.wa_order_items');
    expect(insertStart).toBeGreaterThan(-1);
    const valuesBlock = body.slice(insertStart, body.indexOf(');', insertStart));
    expect(valuesBlock).not.toMatch(/v_item->>'product_price'/);
    expect(valuesBlock).not.toMatch(/v_item->>'subtotal'/);
    expect(valuesBlock).not.toMatch(/v_item->>'product_name'/);
    expect(valuesBlock).toMatch(/v_product\.price/);
    expect(valuesBlock).toMatch(/v_product\.name/);
    expect(valuesBlock).toMatch(/v_line_subtotal/);
  });

  it('el subtotal/total del pedido se recalculan desde v_order_subtotal (suma de líneas validadas), nunca desde p_total_amount/p_subtotal', () => {
    const updateStart = body.indexOf('UPDATE public.wa_orders');
    expect(updateStart).toBeGreaterThan(-1);
    const updateBlock = body.slice(updateStart, body.indexOf('WHERE id = v_order_id', updateStart));
    expect(updateBlock).toMatch(/total_amount = v_order_subtotal/);
    expect(updateBlock).toMatch(/subtotal = v_order_subtotal/);
    expect(updateBlock).not.toMatch(/p_total_amount/);
    expect(updateBlock).not.toMatch(/p_subtotal/);
  });

  it('el INSERT inicial de wa_orders no usa p_total_amount/p_subtotal (arrancan en 0, se corrigen después)', () => {
    const insertStart = body.indexOf('INSERT INTO public.wa_orders');
    const insertBlock = body.slice(insertStart, body.indexOf('RETURNING id INTO v_order_id', insertStart));
    expect(insertBlock).not.toMatch(/p_total_amount/);
    expect(insertBlock).not.toMatch(/p_subtotal\b/);
  });

  it('v_line_subtotal = v_product.price * v_quantity (nunca un valor recibido del cliente)', () => {
    expect(body).toMatch(/v_line_subtotal\s*:=\s*v_product\.price\s*\*\s*v_quantity/);
  });

  it('currency del pedido sale de v_business.currency, ignora p_currency', () => {
    const insertStart = body.indexOf('INSERT INTO public.wa_orders');
    const insertBlock = body.slice(insertStart, body.indexOf('RETURNING id INTO v_order_id', insertStart));
    expect(insertBlock).toMatch(/COALESCE\(v_business\.currency, 'USD'\)/);
    expect(insertBlock).not.toMatch(/p_currency/);
  });
});

describe('SEGURIDAD-WALINKA-2 — validaciones server-side por línea', () => {
  const body = functionBody(codeOnly, 'wa_create_order_with_items');

  it('cross-business: el producto se busca filtrando business_id = p_business_id', () => {
    const selectStart = body.indexOf('SELECT id, name, price, is_active, is_sold_out, stock_actual');
    expect(selectStart).toBeGreaterThan(-1);
    const selectBlock = body.slice(selectStart, body.indexOf('PRODUCT_NOT_FOUND', selectStart));
    expect(selectBlock).toMatch(/business_id = p_business_id/);
  });

  it('producto no encontrado (o de otro negocio) → PRODUCT_NOT_FOUND', () => {
    expect(body).toMatch(/IF NOT FOUND THEN\s*\n\s*RAISE EXCEPTION 'PRODUCT_NOT_FOUND'/);
  });

  it('producto inactivo o agotado → PRODUCT_NOT_AVAILABLE', () => {
    expect(body).toMatch(/NOT v_product\.is_active OR v_product\.is_sold_out[\s\S]{0,80}PRODUCT_NOT_AVAILABLE/);
  });

  it('stock insuficiente (cuando stock_actual no es NULL) → INSUFFICIENT_STOCK', () => {
    expect(body).toMatch(/v_product\.stock_actual IS NOT NULL AND v_quantity > v_product\.stock_actual[\s\S]{0,80}INSUFFICIENT_STOCK/);
  });

  it('cantidad nula o menor a 1 → INVALID_QUANTITY', () => {
    expect(body).toMatch(/v_quantity IS NULL OR v_quantity < 1[\s\S]{0,80}INVALID_QUANTITY/);
  });

  it('product_id ausente/nulo → INVALID_ITEM', () => {
    expect(body).toMatch(/v_product_id IS NULL[\s\S]{0,80}INVALID_ITEM/);
  });

  it('negocio inexistente → BUSINESS_NOT_FOUND; negocio inactivo → BUSINESS_INACTIVE', () => {
    expect(body).toMatch(/BUSINESS_NOT_FOUND/);
    expect(body).toMatch(/NOT v_business\.is_active[\s\S]{0,60}BUSINESS_INACTIVE/);
  });

  it('carrito vacío/nulo/no-array → EMPTY_CART', () => {
    expect(body).toMatch(/p_items IS NULL OR jsonb_typeof\(p_items\) <> 'array' OR jsonb_array_length\(p_items\) = 0[\s\S]{0,80}EMPTY_CART/);
  });

  it('selected_options se persiste tal cual (descriptivo, no participa del cálculo de precio)', () => {
    const insertStart = body.indexOf('INSERT INTO public.wa_order_items');
    const valuesBlock = body.slice(insertStart, body.indexOf(');', insertStart));
    expect(valuesBlock).toMatch(/COALESCE\(v_item->'selected_options', '\[\]'::jsonb\)/);
  });
});

describe('SEGURIDAD-WALINKA-2 — firma/grants sin cambios (compatibilidad con el frontend actual)', () => {
  it('misma firma exacta que la función anterior (20260921140000)', () => {
    const sig = 'UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB';
    expect(codeOnly).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.wa_create_order_with_items\\(\\s*\\n\\s*p_business_id\\s*UUID`));
    expect(codeOnly).toMatch(new RegExp(`FROM PUBLIC;\\s*\\n\\s*\\nGRANT EXECUTE ON FUNCTION public\\.wa_create_order_with_items\\(\\s*\\n\\s*${sig}\\s*\\n\\s*\\) TO anon, authenticated;`));
  });

  it('sigue siendo SECURITY DEFINER con search_path fijo', () => {
    expect(codeOnly).toMatch(/CREATE OR REPLACE FUNCTION public\.wa_create_order_with_items[\s\S]{0,400}SECURITY DEFINER\s*\n\s*SET search_path = public, extensions/);
  });
});

describe('SEGURIDAD-WALINKA-2 — cierre del bypass directo de wa_orders_anon_insert', () => {
  it('DROP POLICY "wa_orders_anon_insert" ON public.wa_orders', () => {
    expect(codeOnly).toMatch(/DROP POLICY IF EXISTS "wa_orders_anon_insert" ON public\.wa_orders;/);
  });

  it('no elimina ninguna otra policy de wa_orders/wa_order_items', () => {
    const dropPolicies = codeOnly.match(/DROP POLICY[^;]*;/g) || [];
    expect(dropPolicies).toHaveLength(1);
    expect(dropPolicies[0]).toMatch(/wa_orders_anon_insert/);
  });
});

describe('SEGURIDAD-WALINKA-2 — no toca tablas/alcance fuera de este ticket', () => {
  it('no crea/altera/elimina ninguna tabla', () => {
    expect(codeOnly).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });

  it('no menciona Mercado Pago, mp_connections ni wa_create_merchant_checkout_order (ya correctos, fuera de alcance)', () => {
    expect(codeOnly).not.toMatch(/mp_connections|wa_create_merchant_checkout_order/);
  });
});
