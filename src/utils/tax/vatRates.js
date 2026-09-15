// TAX-SUMMARY-1 — tasas de IVA por país, único punto de la app donde
// debería vivir este número. Chile es hoy el único mercado activo de
// Walinka; Argentina se deja declarada de antemano (decisión de producto)
// para que activarla el día de mañana sea cambiar un valor acá, no salir
// a buscar dónde quedó un 19% hardcodeado en cada lugar nuevo.
//
// SupplierInvoiceFormModal.jsx ya tenía su propia getDefaultTaxRate(country)
// con la misma tabla -- se deja intacta a propósito (mismo criterio que su
// propio comentario: no acoplar módulos ya estables a un refactor que
// nadie pidió). Este archivo es la fuente para código NUEVO (el resumen
// de Compras/Ventas de Costos); no reemplaza esa función existente.
const VAT_RATE_BY_COUNTRY = {
  CL: 19,
  AR: 21,
};

// Chile: único mercado activo hoy -- default seguro si el negocio todavía
// no tiene country_code persistido (ver hasPersistedBusinessCountry).
const DEFAULT_VAT_RATE = VAT_RATE_BY_COUNTRY.CL;

/** Tasa de IVA (número entero, ej. 19) para un country_code ISO (case-insensitive). */
export function getVatRateForCountry(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return VAT_RATE_BY_COUNTRY[code] ?? DEFAULT_VAT_RATE;
}

/**
 * Descompone un monto que YA INCLUYE IVA (boletas/facturas emitidas en
 * Chile siempre lo incluyen) en neto + impuesto, sin tocar el total
 * original. Puramente informativo -- no persiste nada, no es la fuente de
 * verdad de ningún documento tributario.
 */
export function splitTaxIncludedAmount(total, ratePercent) {
  const t = Number(total) || 0;
  const r = Number(ratePercent) || 0;
  const net = +(t / (1 + r / 100)).toFixed(2);
  const tax = +(t - net).toFixed(2);
  return { net, tax, total: t };
}
