/**
 * PLAN_FEATURES — fuente única de verdad para capacidades booleanas por plan.
 *
 * Regla: para agregar una nueva funcionalidad al sistema de permisos,
 * solo modificar este archivo. Los límites numéricos (maxProducts, etc.)
 * siguen en src/constants/plans.js → PLAN_LIMITS.
 *
 * Planes: starter (gratis) → pro (pago) → business (Full).
 */
export const PLAN_FEATURES = Object.freeze({
  starter: {
    // ── Catálogo y pedidos ───────────────────────────────────────
    catalog:               true,
    orders:                true,

    // ── CRM — módulos básicos ─────────────────────────────────────
    crm:                   true,
    customers:             true,
    quotes:                true,   // Presupuestos
    pos:                   true,   // Terminal de ventas básico

    // ── CRM — módulos que requieren plan superior ────────────────
    invoices:              false,  // Notas de venta / facturas
    customerAccount:       false,  // Cuenta corriente (abonos)
    barcodePrinting:       false,  // Generación de códigos EAN-13
    labelPrinting:         false,  // Impresión de etiquetas
    stockManagement:       false,  // Control de inventario
    cashRegister:          false,  // Caja diaria / TPV avanzado
    purchaseInvoices:      false,  // Compras y facturas recibidas
    fixedCosts:            false,  // Módulo de costos fijos
    costCenter:            false,  // Termómetro del negocio

    // ── IA y análisis ─────────────────────────────────────────────
    aiAssistant:           false,
    advancedReports:       false,

    // ── Configuración y personalización ──────────────────────────
    customDomains:         false,
    removeBranding:        false,
  },

  pro: {
    // ── Catálogo y pedidos ───────────────────────────────────────
    catalog:               true,
    orders:                true,

    // ── CRM — todos los módulos ────────────────────────────────────
    crm:                   true,
    customers:             true,
    quotes:                true,
    pos:                   true,

    invoices:              true,
    customerAccount:       true,
    barcodePrinting:       true,
    labelPrinting:         true,
    stockManagement:       true,
    cashRegister:          true,
    purchaseInvoices:      true,
    fixedCosts:            true,
    costCenter:            true,

    // ── IA y análisis ─────────────────────────────────────────────
    aiAssistant:           true,
    advancedReports:       false,

    // ── Configuración y personalización ──────────────────────────
    customDomains:         false,
    removeBranding:        false,
  },

  business: {
    // ── Catálogo y pedidos ───────────────────────────────────────
    catalog:               true,
    orders:                true,

    // ── CRM — todos los módulos ────────────────────────────────────
    crm:                   true,
    customers:             true,
    quotes:                true,
    pos:                   true,

    invoices:              true,
    customerAccount:       true,
    barcodePrinting:       true,
    labelPrinting:         true,
    stockManagement:       true,
    cashRegister:          true,
    purchaseInvoices:      true,
    fixedCosts:            true,
    costCenter:            true,

    // ── IA y análisis ─────────────────────────────────────────────
    aiAssistant:           true,
    advancedReports:       true,

    // ── Configuración y personalización ──────────────────────────
    customDomains:         true,
    removeBranding:        true,
  },
});

/**
 * Plan mínimo requerido para cada feature (para mostrar en UX).
 * Calculado automáticamente a partir de PLAN_FEATURES.
 */
export const FEATURE_MIN_PLAN = Object.freeze(
  Object.keys(PLAN_FEATURES.starter).reduce((acc, feature) => {
    if (PLAN_FEATURES.starter[feature])  { acc[feature] = 'starter';  return acc; }
    if (PLAN_FEATURES.pro[feature])      { acc[feature] = 'pro';       return acc; }
    if (PLAN_FEATURES.business[feature]) { acc[feature] = 'business';  return acc; }
    acc[feature] = 'business';
    return acc;
  }, {})
);

/**
 * Verifica si un plan tiene acceso a una feature.
 * Útil en servicios y funciones que no pueden usar hooks de React.
 *
 * @param {string} planSlug  - 'starter' | 'pro' | 'business'
 * @param {string} feature   - clave de PLAN_FEATURES
 * @returns {boolean}
 */
export function hasPlanFeature(planSlug, feature) {
  const slug = planSlug && Object.prototype.hasOwnProperty.call(PLAN_FEATURES, planSlug)
    ? planSlug
    : 'starter';
  return PLAN_FEATURES[slug]?.[feature] ?? false;
}

/**
 * Verifica feature con la lógica de early-access del CRM.
 * Si CRM_EARLY_ACCESS_MODE está activo, todos los accesos CRM se conceden.
 *
 * @param {string}  planSlug
 * @param {string}  feature
 * @param {boolean} [earlyAccessOverride=false]
 * @returns {boolean}
 */
export function hasPlanFeatureWithOverride(planSlug, feature, earlyAccessOverride = false) {
  if (earlyAccessOverride) return true;
  return hasPlanFeature(planSlug, feature);
}
