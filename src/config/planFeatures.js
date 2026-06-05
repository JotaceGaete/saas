/**
 * PLAN_FEATURES — fuente única de verdad comercial de Ventalink.
 *
 * Define qué incluye cada plan (Starter / Pro / Business).
 * Para agregar una feature: solo agregar un objeto a este array.
 *
 * Helpers exportados:
 *   hasPlanFeature(planSlug, featureId)      → boolean
 *   canUseFeature(planSlug, featureId)       → alias semántico
 *   getFeature(featureId)                    → objeto feature | undefined
 *   getFeaturesByPlan(planSlug)              → features accesibles en ese plan
 *   getLockedFeatures(planSlug)              → features bloqueadas en ese plan (showLocked)
 *   FEATURE_MIN_PLAN                         → { [id]: 'starter'|'pro'|'business' }
 */

const PLAN_ORDER = ['starter', 'pro', 'business'];

export const PLAN_FEATURES = [

  // ══════════════════════════════════════════════════════════════════════════
  // CATÁLOGO
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'catalog',
    label: 'Catálogo público',
    description: 'Catálogo compartible por WhatsApp con URL propia.',
    salesPitch: 'Tus productos en línea en minutos. Comparte el link por WhatsApp y empieza a vender.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'productManagement',
    label: 'Gestión de productos',
    description: 'Alta, edición y organización de productos con imágenes.',
    salesPitch: 'Carga tus productos con foto, precio y descripción. Listos para vender.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'publicCatalogDesign',
    label: 'Diseño del catálogo',
    description: 'Personalización de colores, logo y portada del catálogo.',
    salesPitch: 'Tu catálogo con tu marca. Colores, logo y foto de portada propios.',
    category: 'Catálogo',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'productLimit',
    label: 'Productos ilimitados',
    description: 'Sin límite en la cantidad de productos del catálogo.',
    salesPitch: 'Carga todos los productos que necesites, sin restricciones.',
    category: 'Catálogo',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'customDomains',
    label: 'Dominio personalizado',
    description: 'Tu catálogo en tu propio dominio. Mejor posicionamiento.',
    salesPitch: 'Usa tutienda.com en vez de ventalink.app/tutienda. Más profesional.',
    category: 'Catálogo',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'orders',
    label: 'Pedidos online',
    description: 'Recibe y gestiona pedidos desde el catálogo público.',
    salesPitch: 'Tus clientes hacen el pedido y tú lo gestionas desde el panel.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'pos',
    label: 'TPV básico',
    description: 'Terminal de venta rápida con carrito, cobro y búsqueda de productos.',
    salesPitch: 'Cobra en mostrador en segundos. Sin papeles, sin confusiones.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'quotes',
    label: 'Presupuestos',
    description: 'Crea y comparte presupuestos con clientes en PDF o WhatsApp.',
    salesPitch: 'Presupuesta en el momento. El cliente lo aprueba con un clic.',
    category: 'Ventas',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'invoices',
    label: 'Facturas internas',
    description: 'Notas de venta con historial de pagos y seguimiento.',
    salesPitch: 'Convierte presupuestos en ventas. Controla cuánto pagó cada cliente.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'salesNotes',
    label: 'Notas de venta',
    description: 'Documentos simplificados de venta para cobros en mostrador.',
    salesPitch: 'Comprobante rápido para ventas al contado. Historial completo.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'ticketPrinting',
    label: 'Impresión de tickets',
    description: 'Comprobantes impresos desde el TPV usando impresoras térmicas.',
    salesPitch: 'Entrega tickets impresos a tus clientes directo desde el TPV. Profesional.',
    category: 'Ventas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENTES
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'customers',
    label: 'Gestión de clientes',
    description: 'Base de datos de clientes con historial de compras.',
    salesPitch: 'Guarda los datos de tus clientes y revisa qué compraron.',
    category: 'Clientes',
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'customerAccount',
    label: 'Cuenta corriente',
    description: 'Controla cuánto te deben tus clientes.',
    salesPitch: 'Registra abonos parciales y ve el saldo pendiente de cada cliente en tiempo real.',
    category: 'Clientes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'customerDebtTracking',
    label: 'Seguimiento de deudas',
    description: 'Historial completo de pagos y saldo pendiente por cliente.',
    salesPitch: 'Nunca más pierdas de vista lo que te deben. Todo en un solo lugar.',
    category: 'Clientes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INVENTARIO
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'stockManagement',
    label: 'Control de stock',
    description: 'Inventario en tiempo real con alertas de stock mínimo.',
    salesPitch: 'Controla existencias sin planillas. Sabe cuándo reponer antes de quedarte sin stock.',
    category: 'Inventario',
    // Starter gets basic stock visibility (CAMBIO 3)
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'barcodePrinting',
    label: 'Códigos de barras',
    description: 'Genera códigos EAN-13 internos y búsqueda por escáner en TPV.',
    salesPitch: 'Etiqueta tus productos con código de barras propio. Escanea en caja.',
    category: 'Inventario',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'labelPrinting',
    label: 'Impresión de etiquetas',
    description: 'Imprime precios para góndolas y productos en 4 tamaños.',
    salesPitch: 'Etiquetas con precio y barcode listas para pegar en góndola o producto.',
    category: 'Inventario',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FINANZAS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'cashRegister',
    label: 'Caja diaria',
    description: 'Apertura y cierre de caja con resumen por método de pago.',
    salesPitch: 'Controla el efectivo del día. Cierre de caja con totales por medio de pago.',
    category: 'Finanzas',
    // Starter gets basic cash register (CAMBIO 3)
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'purchaseInvoices',
    label: 'Facturas de compra',
    description: 'Registra facturas recibidas. IVA crédito estimado por proveedor.',
    salesPitch: 'Carga lo que compraste. El sistema calcula tu IVA crédito automáticamente.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'fixedCosts',
    label: 'Costos fijos',
    description: 'Registra arriendo, sueldos y servicios por categoría.',
    salesPitch: 'Define tus gastos fijos del mes y Ventalink los considera en tu rentabilidad.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'costCenter',
    // CAMBIO 5: renombrado comercialmente.
    // Alternativas evaluadas:
    //   A) "Salud financiera"       ← elegida: clara, positiva, habla de estado
    //   B) "Estado del negocio"     — genérico
    //   C) "¿Estoy ganando dinero?" — informal, pero memorable para demos
    //   D) "Radar financiero"       — técnico
    label: 'Salud financiera',
    description: 'Semáforo de rentabilidad diaria. Ventas vs costos fijos vs IVA neto.',
    salesPitch: 'En un vistazo: ¿hoy estás ganando o perdiendo? Verde, amarillo o rojo.',
    category: 'Finanzas',
    // Starter gets basic cost center visibility (CAMBIO 3)
    plans: { starter: true, pro: true, business: true },
    status: 'active',
    showLocked: false,
  },
  {
    id: 'ivaSummary',
    label: 'Resumen de IVA',
    description: 'Estimación de IVA débito/crédito del período.',
    salesPitch: 'Sabe cuánto IVA debes pagar este mes antes de que llegue la fecha.',
    category: 'Finanzas',
    plans: { starter: false, pro: true, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'financialProjection',
    label: 'Proyección financiera',
    description: 'Proyección de ingresos y gastos basada en histórico.',
    salesPitch: 'Anticipa cómo cerrarás el mes. ¿Vas a llegar a cubrir tus costos fijos?',
    category: 'Finanzas',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // IA
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'aiAssistant',
    label: 'Asistente IA',
    description: 'Respuestas automáticas y sugerencias inteligentes para el negocio.',
    salesPitch: 'Tu asistente disponible 24/7. Responde consultas y sugiere acciones.',
    category: 'IA',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'aiProductDescription',
    label: 'IA: descripciones de producto',
    description: 'Genera descripciones atractivas para productos con IA.',
    salesPitch: 'Escribe la descripción del producto en segundos. La IA la hace vendedora.',
    category: 'IA',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'aiBusinessInsights',
    label: 'IA: análisis del negocio',
    description: 'Recomendaciones automáticas basadas en datos del negocio.',
    salesPitch: 'La IA analiza tus números y te dice qué hacer para ganar más.',
    category: 'IA',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTES
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'basicReports',
    label: 'Reportes básicos',
    description: 'Ventas del período y productos más vendidos.',
    salesPitch: 'Mira tus ventas del mes y qué productos se venden más.',
    category: 'Reportes',
    plans: { starter: false, pro: true, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'advancedReports',
    label: 'Reportes avanzados',
    description: 'Análisis de tendencias, comparativas y dashboard personalizable.',
    salesPitch: 'Datos profundos para tomar decisiones. Tendencias, comparativas, KPIs.',
    category: 'Reportes',
    plans: { starter: false, pro: false, business: true },
    status: 'active',
    showLocked: true,
  },
  {
    id: 'exportPdf',
    label: 'Exportar a PDF',
    description: 'Descarga reportes, facturas y presupuestos en PDF.',
    salesPitch: 'Guarda o imprime cualquier reporte o documento en PDF.',
    category: 'Reportes',
    plans: { starter: false, pro: true, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'exportExcel',
    label: 'Exportar a Excel',
    description: 'Descarga reportes y datos en formato Excel.',
    salesPitch: 'Lleva tus datos a Excel para análisis adicionales o compartirlos.',
    category: 'Reportes',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ADMINISTRACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'multiUser',
    label: 'Múltiples usuarios',
    description: 'Agrega colaboradores con acceso al panel.',
    salesPitch: 'Tu equipo trabaja junto en la misma cuenta. Sin compartir contraseñas.',
    category: 'Administración',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'userRoles',
    label: 'Roles de usuario',
    description: 'Define permisos distintos para cada colaborador.',
    salesPitch: 'El cajero solo ve la caja. El dueño ve todo. Control total.',
    category: 'Administración',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'emailAutomation',
    label: 'Automatización por email',
    description: 'Envía confirmaciones y recordatorios automáticos por email.',
    salesPitch: 'El sistema avisa a tus clientes solo. Tú te enfocas en vender.',
    category: 'Administración',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },
  {
    id: 'whatsappAutomation',
    label: 'Automatización por WhatsApp',
    description: 'Mensajes automáticos de seguimiento y confirmación de pedidos.',
    salesPitch: 'Confirma pedidos y fideliza clientes por WhatsApp sin esfuerzo.',
    category: 'Administración',
    plans: { starter: false, pro: false, business: true },
    status: 'planned',
    showLocked: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PERSONALIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'removeBranding',
    label: 'Marca blanca',
    description: 'Elimina el "Powered by Ventalink" del catálogo público.',
    salesPitch: 'Tu catálogo, solo tu marca. Sin mencionar Ventalink.',
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

/** Devuelve todas las features accesibles (true) para un plan. */
export function getFeaturesByPlan(planSlug) {
  const slug = PLAN_ORDER.includes(planSlug) ? planSlug : 'starter';
  return PLAN_FEATURES.filter(f => f.plans[slug] === true);
}

/** Devuelve las features bloqueadas (showLocked) para un plan. */
export function getLockedFeatures(planSlug) {
  const slug = PLAN_ORDER.includes(planSlug) ? planSlug : 'starter';
  return PLAN_FEATURES.filter(f => f.plans[slug] !== true && f.showLocked);
}

/**
 * Mapa featureId → plan mínimo requerido.
 * Calculado automáticamente.
 */
export const FEATURE_MIN_PLAN = Object.freeze(
  PLAN_FEATURES.reduce((acc, feat) => {
    acc[feat.id] = PLAN_ORDER.find(p => feat.plans[p] === true) ?? 'business';
    return acc;
  }, {})
);

/** Verifica feature con override de early-access. */
export function hasPlanFeatureWithOverride(planSlug, featureId, earlyAccessOverride = false) {
  if (earlyAccessOverride) return true;
  return hasPlanFeature(planSlug, featureId);
}

/**
 * TODO (FASE 6 — Validación backend):
 * Las features que escriben datos sensibles deben validarse en backend
 * (Supabase Edge Function / RLS), no solo en frontend.
 *
 * Pendientes cuando se salga de CRM_EARLY_ACCESS_MODE:
 *   invoices, customerAccount, barcodePrinting, labelPrinting, ticketPrinting,
 *   stockManagement, purchaseInvoices, fixedCosts, cashRegister,
 *   aiAssistant, advancedReports, multiUser, customDomains
 *
 * Patrón: cada Edge Function lee planSlug del negocio desde BD
 * y aplica hasPlanFeature() antes de ejecutar la operación.
 */
