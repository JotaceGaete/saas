/**
 * PLAN_FEATURES — fuente única de verdad para capacidades de Ventalink.
 *
 * Cada feature incluye: id, label, description, category, plans por slug,
 * status (active | planned | deprecated), showLocked (mostrar tarjeta o esconder).
 *
 * Helpers exportados:
 *   hasPlanFeature(planSlug, featureId)         — boolean
 *   canUseFeature(planSlug, featureId)          — alias semántico
 *   getFeature(featureId)                       — objeto feature o undefined
 *   getFeaturesByPlan(planSlug)                 — features accesibles en ese plan
 *   getLockedFeatures(planSlug)                 — features NO accesibles en ese plan
 *   FEATURE_MIN_PLAN                            — { [featureId]: 'starter'|'pro'|'business' }
 *
 * Para agregar una funcionalidad nueva: solo agregar un objeto a este array.
 */

const PLAN_ORDER = ['starter', 'pro', 'business'];

export const PLAN_FEATURES = [

  // ── Catálogo ─────────────────────────────────────────────────────────────
  {
    id: 'catalog',
    label: 'Catálogo público',
    description: 'Catálogo online compartible por WhatsApp.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'productManagement',
    label: 'Gestión de productos',
    description: 'Alta, edición y organización de productos con imágenes.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'productLimit',
    label: 'Productos ilimitados',
    description: 'Sin límite en la cantidad de productos del catálogo.',
    category: 'Catálogo',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'publicCatalogDesign',
    label: 'Diseño del catálogo',
    description: 'Personalización de colores, logo y portada del catálogo.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'customDomains',
    label: 'Dominio personalizado',
    description: 'Tu catálogo en tu propio dominio. Mejor posicionamiento.',
    category: 'Catálogo',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },

  // ── Ventas ────────────────────────────────────────────────────────────────
  {
    id: 'orders',
    label: 'Pedidos online',
    description: 'Recibe y gestiona pedidos desde el catálogo público.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'pos',
    label: 'TPV básico',
    description: 'Terminal de punto de venta para cobros rápidos.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'quotes',
    label: 'Presupuestos',
    description: 'Crea y comparte presupuestos con clientes.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'invoices',
    label: 'Facturas internas',
    description: 'Crear y gestionar notas de venta/facturas desde el CRM.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'salesNotes',
    label: 'Notas de venta',
    description: 'Documentos simplificados de venta para cobros en mostrador.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'cashRegister',
    label: 'Caja diaria',
    description: 'Apertura y cierre de caja con resumen por método de pago.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ── Clientes ─────────────────────────────────────────────────────────────
  {
    id: 'customers',
    label: 'Gestión de clientes',
    description: 'Base de datos de clientes con historial de compras.',
    category: 'Clientes',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'customerAccount',
    label: 'Cuenta corriente',
    description: 'Registra abonos parciales y controla deuda por cliente.',
    category: 'Clientes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'customerDebtTracking',
    label: 'Seguimiento de deudas',
    description: 'Historial completo de pagos y saldo pendiente por cliente.',
    category: 'Clientes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ── Inventario ────────────────────────────────────────────────────────────
  {
    id: 'stockManagement',
    label: 'Control de stock',
    description: 'Inventario en tiempo real con stock mínimo configurable.',
    category: 'Inventario',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'barcodePrinting',
    label: 'Códigos de barras',
    description: 'Genera EAN-13 internos y búsqueda por escáner en TPV.',
    category: 'Inventario',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'labelPrinting',
    label: 'Impresión de etiquetas',
    description: 'Etiquetas en 4 tamaños con precio y código de barras.',
    category: 'Inventario',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ── Compras ───────────────────────────────────────────────────────────────
  {
    id: 'purchaseInvoices',
    label: 'Facturas de compra',
    description: 'Registra facturas recibidas. IVA crédito estimado.',
    category: 'Compras',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  {
    id: 'fixedCosts',
    label: 'Costos fijos',
    description: 'Registra arriendo, sueldos y servicios por categoría.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'costCenter',
    label: 'Termómetro del negocio',
    description: 'Semáforo de rentabilidad diaria. Costo fijo vs ventas.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'ivaSummary',
    label: 'Resumen de IVA',
    description: 'Estimación de IVA débito/crédito del período.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'financialProjection',
    label: 'Proyección financiera',
    description: 'Proyección de ingresos y gastos futuros basada en histórico.',
    category: 'Finanzas',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ── IA ────────────────────────────────────────────────────────────────────
  {
    id: 'aiAssistant',
    label: 'Asistente IA',
    description: 'Respuestas automáticas, sugerencias inteligentes.',
    category: 'IA',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'aiProductDescription',
    label: 'IA: descripciones de producto',
    description: 'Genera descripciones atractivas para productos con IA.',
    category: 'IA',
    plans: { starter: false, pro: true, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'aiBusinessInsights',
    label: 'IA: análisis de negocio',
    description: 'Recomendaciones automáticas basadas en datos del negocio.',
    category: 'IA',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ── Reportes ──────────────────────────────────────────────────────────────
  {
    id: 'basicReports',
    label: 'Reportes básicos',
    description: 'Ventas del período, productos más vendidos.',
    category: 'Reportes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'advancedReports',
    label: 'Reportes avanzados',
    description: 'Análisis de tendencias, dashboard personalizable.',
    category: 'Reportes',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'exportExcel',
    label: 'Exportar a Excel',
    description: 'Descarga reportes y datos en formato Excel.',
    category: 'Reportes',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'exportPdf',
    label: 'Exportar a PDF',
    description: 'Descarga reportes, facturas y presupuestos en PDF.',
    category: 'Reportes',
    plans: { starter: false, pro: true, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ── Equipo ────────────────────────────────────────────────────────────────
  {
    id: 'multiUser',
    label: 'Múltiples usuarios',
    description: 'Agrega colaboradores con acceso al panel de gestión.',
    category: 'Equipo',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'userRoles',
    label: 'Roles de usuario',
    description: 'Define permisos distintos para cada colaborador.',
    category: 'Equipo',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ── Automatización ────────────────────────────────────────────────────────
  {
    id: 'emailAutomation',
    label: 'Automatización por email',
    description: 'Envía recordatorios, confirmaciones y seguimientos automáticos.',
    category: 'Automatización',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'whatsappAutomation',
    label: 'Automatización por WhatsApp',
    description: 'Mensajes automáticos de confirmación y seguimiento de pedidos.',
    category: 'Automatización',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ── Personalización ───────────────────────────────────────────────────────
  {
    id: 'removeBranding',
    label: 'Sin marca Ventalink',
    description: 'Elimina el "Powered by Ventalink" del catálogo público.',
    category: 'Personalización',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },
];

// ── Helpers derivados ──────────────────────────────────────────────────────

/** Devuelve true si el plan tiene acceso a la feature. */
export function hasPlanFeature(planSlug, featureId) {
  const slug = PLAN_ORDER.includes(planSlug) ? planSlug : 'starter';
  const feat = PLAN_FEATURES.find(f => f.id === featureId);
  return feat?.plans[slug] ?? false;
}

/** Alias semántico de hasPlanFeature. */
export const canUseFeature = hasPlanFeature;

/** Devuelve el objeto feature completo, o undefined si no existe. */
export function getFeature(featureId) {
  return PLAN_FEATURES.find(f => f.id === featureId);
}

/** Devuelve todas las features accesibles para un plan dado. */
export function getFeaturesByPlan(planSlug) {
  const slug = PLAN_ORDER.includes(planSlug) ? planSlug : 'starter';
  return PLAN_FEATURES.filter(f => f.plans[slug] === true);
}

/** Devuelve las features NO accesibles en un plan (candidatas a mostrar como bloqueadas). */
export function getLockedFeatures(planSlug) {
  const slug = PLAN_ORDER.includes(planSlug) ? planSlug : 'starter';
  return PLAN_FEATURES.filter(f => f.plans[slug] !== true && f.showLocked);
}

/**
 * Mapa featureId → plan mínimo requerido.
 * Calculado automáticamente a partir de los flags de PLAN_FEATURES.
 */
export const FEATURE_MIN_PLAN = Object.freeze(
  PLAN_FEATURES.reduce((acc, feat) => {
    const min = PLAN_ORDER.find(p => feat.plans[p] === true) ?? 'business';
    acc[feat.id] = min;
    return acc;
  }, {})
);

/**
 * Verifica feature con override de early-access.
 * @param {string}  planSlug
 * @param {string}  featureId
 * @param {boolean} [earlyAccessOverride=false]
 */
export function hasPlanFeatureWithOverride(planSlug, featureId, earlyAccessOverride = false) {
  if (earlyAccessOverride) return true;
  return hasPlanFeature(planSlug, featureId);
}

/**
 * TODO (FASE 6 — Backend):
 * Las features que escriben datos sensibles o premium deben validarse también
 * en backend (Supabase Edge Function / RLS / API route), NO solo en frontend.
 *
 * Features que REQUIEREN validación backend cuando se salga de early-access:
 *   - invoices          → crear/modificar notas de venta
 *   - customerAccount   → registrar abonos
 *   - barcodePrinting   → generar código EAN-13
 *   - labelPrinting     → imprimir etiquetas
 *   - stockManagement   → movimientos de inventario
 *   - purchaseInvoices  → registrar compras
 *   - fixedCosts        → registrar costos fijos
 *   - aiAssistant       → ejecutar consultas IA
 *   - advancedReports   → exportar datos
 *   - multiUser         → crear usuarios adicionales
 *   - customDomains     → asociar dominio externo
 *
 * Patrón sugerido: cada Edge Function lee el planSlug del negocio desde la BD
 * y aplica hasPlanFeature() antes de ejecutar la operación.
 */
