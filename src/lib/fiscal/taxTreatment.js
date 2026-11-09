// Tratamiento tributario de productos y desglose de una venta con precios con IVA incluido.
//
// Fuentes (ver supabase/fiscal-recovery/proposed/20261104_fiscal_product_tax_category.sql):
//  - SII, Formato Boletas Electrónicas v4.2: IndExe = 1 marca un ítem "exento o no afecto";
//    MntExe suma esas líneas. En el TPV, exento y no afecto se guardan por separado (son
//    conceptos legales distintos), pero en la boleta ambos van como línea con IndExe = 1.
//  - Boletas 51105 y 51106 aceptadas por el SII vía DTE Core: precio por línea BRUTO; el neto y
//    el IVA se calculan sobre el total afecto del documento:
//      neto = round(afecto / 1,19)  ·  IVA = afecto − neto  (1190 → 1000 + 190; 100 → 84 + 16).
//
// Regla de emisión (servidor y simulación): hoy solo se emite DTE 39 si TODAS las líneas son
// afectas. Exentas y no afectas no están verificadas con DTE Core y una venta exenta corresponde
// a la boleta 41, que esta integración no emite. Esas ventas imprimen el comprobante interno.

export const TAX_TREATMENT = Object.freeze({
  AFECTO: 'IVA_AFECTO_19',
  EXENTO: 'EXENTO',
  NO_AFECTO: 'NO_AFECTO',
});

export const TAX_TREATMENTS = Object.freeze([TAX_TREATMENT.AFECTO, TAX_TREATMENT.EXENTO, TAX_TREATMENT.NO_AFECTO]);

export const TAX_TREATMENT_LABELS = Object.freeze({
  [TAX_TREATMENT.AFECTO]: 'Afecto a IVA (19 %)',
  [TAX_TREATMENT.EXENTO]: 'Exento de IVA',
  [TAX_TREATMENT.NO_AFECTO]: 'No afecto a IVA',
});

export const IVA_RATE = 0.19;

export function isValidTaxTreatment(value) {
  return TAX_TREATMENTS.includes(value);
}

/**
 * Categoría efectiva de una línea: la del producto o, si no tiene, la por defecto del negocio.
 * null = sin información tributaria (no se puede emitir).
 */
export function resolveLineTaxTreatment(productTreatment, businessDefault = null) {
  if (isValidTaxTreatment(productTreatment)) return productTreatment;
  if (isValidTaxTreatment(businessDefault)) return businessDefault;
  return null;
}

/**
 * Desglose de una venta con precios con IVA incluido.
 * @param {{ gross: number, treatment: string|null }[]} lines - gross = precio unitario × cantidad (entero)
 * @returns {{ ok: true, afecto: number, neto: number, iva: number, exento: number, noAfecto: number, mntExe: number, total: number }
 *          | { ok: false, code: string, line?: number }}
 */
export function computeTaxBreakdown(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, code: 'NO_LINES' };
  let afecto = 0;
  let exento = 0;
  let noAfecto = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const { gross, treatment } = lines[i] ?? {};
    if (!Number.isSafeInteger(gross) || gross < 0) return { ok: false, code: 'INVALID_AMOUNT', line: i + 1 };
    if (treatment === TAX_TREATMENT.AFECTO) afecto += gross;
    else if (treatment === TAX_TREATMENT.EXENTO) exento += gross;
    else if (treatment === TAX_TREATMENT.NO_AFECTO) noAfecto += gross;
    else return { ok: false, code: 'TAX_TREATMENT_MISSING', line: i + 1 };
  }
  const neto = Math.round(afecto / (1 + IVA_RATE));
  const iva = afecto - neto;
  const mntExe = exento + noAfecto;
  return { ok: true, afecto, neto, iva, exento, noAfecto, mntExe, total: afecto + mntExe };
}

/**
 * ¿Se puede emitir esta venta como boleta electrónica (DTE 39) hoy?
 * Mismos códigos que el servidor (fiscal-emit, lib/eligibility.mjs).
 * @returns {null | 'FISCAL_TAX_LINES_NOT_VERIFIED' | 'FISCAL_NON_TAXABLE_NOT_SUPPORTED'}
 */
export function dte39TaxBlocker(treatments) {
  if (!Array.isArray(treatments) || treatments.length === 0) return 'FISCAL_TAX_LINES_NOT_VERIFIED';
  if (treatments.some((t) => !isValidTaxTreatment(t))) return 'FISCAL_TAX_LINES_NOT_VERIFIED';
  if (treatments.some((t) => t !== TAX_TREATMENT.AFECTO)) return 'FISCAL_NON_TAXABLE_NOT_SUPPORTED';
  return null;
}
