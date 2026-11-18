/**
 * Disponibilidad pública (Storefront v1.2 §4.2). Orden fijo:
 * 1. is_sold_out → sold_out
 * 2. stock_actual <= 0 → sold_out
 * 3. stock_actual <= stock_minimo → low_stock
 * 4. en otro caso → available
 * inventoryControlled = stock_actual IS NOT NULL
 */
export function computeAvailability({ isSoldOut, stockActual, stockMinimo }) {
  const inventoryControlled = stockActual !== null && stockActual !== undefined;
  if (isSoldOut === true) return { availability: 'sold_out', inventoryControlled };
  if (inventoryControlled && stockActual <= 0) return { availability: 'sold_out', inventoryControlled };
  if (
    inventoryControlled &&
    stockMinimo !== null && stockMinimo !== undefined &&
    stockActual <= stockMinimo
  ) {
    return { availability: 'low_stock', inventoryControlled };
  }
  return { availability: 'available', inventoryControlled };
}
