/**
 * Dashboard insight engine.
 *
 * V1: generateInsights(data)  — first-match, single insight, legacy shape
 * V2: generateInsightsV2(data) — scoring model, primary + secondary + meta
 *
 * V1 is now a thin wrapper over V2 for backward compatibility.
 */

import { getSourceLabel } from './analytics';

// ── Internal helpers ──────────────────────────────────────────────────────────

function topSourceEntry(breakdown) {
  if (!breakdown || Object.keys(breakdown).length === 0) return null;
  return Object.entries(breakdown).sort(([, a], [, b]) => b - a)[0];
}

function breakdownTotal(breakdown) {
  if (!breakdown) return 0;
  return Object.values(breakdown).reduce((s, n) => s + n, 0);
}

/** Clamp a number between min and max (inclusive). */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ── Priority weights ──────────────────────────────────────────────────────────

const PRIORITY_WEIGHTS = {
  critical:  1000,
  high:       700,
  medium:     400,
  low:        150,
  positive:    50,
};

// Maps V2 priority to the V1 spanish string expected by AiInsightsCard.
const PRIORITY_TO_LEGACY = {
  critical: 'alta',
  high:     'alta',
  medium:   'media',
  low:      'baja',
  positive: 'baja',
};

// ── Rule definitions (V2) ─────────────────────────────────────────────────────
//
// Each rule:
//   id         — stable identifier, safe to use as React key or analytics event
//   category   — groups semantically related rules; used to avoid redundant secondaries
//   priority   — base tier, determines the floor score
//   evaluate   — (safeData) => null when rule doesn't fire, or candidate object
//
// Bonus scores extend the base weight based on signal magnitude.
// All bonuses are clamped so no single signal can override priority tiers.

const RULES_V2 = [
  // ─ setup ─────────────────────────────────────────────────────────────────────
  {
    id: 'no_active_products',
    category: 'setup',
    priority: 'critical',
    evaluate({ activeProducts }) {
      if (activeProducts > 0) return null;
      return {
        score:     PRIORITY_WEIGHTS.critical,
        finding:   'Tu catálogo no tiene productos activos todavía.',
        alert:     'Sin productos, los clientes que lleguen al catálogo no verán nada que comprar.',
        action:    'Crea al menos un producto con foto y precio para activar tu tienda.',
        ctaLabel:  'Agregar producto',
        ctaTarget: '/product-editor',
      };
    },
  },

  // ─ conversion ─────────────────────────────────────────────────────────────────
  {
    id: 'visits_no_orders',
    category: 'conversion',
    priority: 'high',
    evaluate({ visits30d, recentOrders, businessSlug }) {
      if (visits30d < 30 || recentOrders > 0) return null;
      // More wasted traffic = higher urgency. Each 5 visits above threshold = +10, cap 100.
      const bonus = clamp(Math.floor((visits30d - 30) / 5) * 10, 0, 100);
      return {
        score:     PRIORITY_WEIGHTS.high + bonus,
        finding:   `Recibiste ${visits30d} visitas en los últimos 30 días, pero ninguna se convirtió en pedido.`,
        alert:     'Algo en el catálogo puede estar frenando a los clientes: precios, fotos o proceso de contacto.',
        action:    'Revisa que el botón de WhatsApp sea visible, los precios estén actualizados y las fotos sean claras.',
        ctaLabel:  'Ver catálogo',
        ctaTarget: businessSlug ? `/catalogo/${businessSlug}` : '/dashboard',
      };
    },
  },

  {
    id: 'low_wa_ctr',
    category: 'conversion',
    priority: 'high',
    evaluate({ visits30d, conversionFunnel }) {
      if (visits30d < 20 || conversionFunnel == null) return null;
      const rate = Number(conversionFunnel.rateClickFromVisit);
      if (rate >= 5) return null;
      // Lower rate = bigger gap from target. Each 1% below 5 = +16, cap 80.
      const bonus = clamp(Math.round((5 - rate) * 16), 0, 80);
      return {
        score:     PRIORITY_WEIGHTS.high + bonus,
        finding:   `Solo el ${rate.toFixed(1)}% de tus ${visits30d} visitantes hace clic en WhatsApp.`,
        alert:     'Un CTR bajo indica que el botón de contacto no es visible o que el producto no genera suficiente interés.',
        action:    'Asegúrate de que el botón de WhatsApp sea visible sin necesidad de hacer scroll.',
        ctaLabel:  'Configurar catálogo',
        ctaTarget: '/business-configuration',
      };
    },
  },

  // ─ payments ───────────────────────────────────────────────────────────────────
  {
    id: 'orders_not_paid',
    category: 'payments',
    priority: 'medium',
    evaluate({ recentOrders, conversionFunnel }) {
      if (recentOrders < 5 || conversionFunnel == null) return null;
      if (Number(conversionFunnel.paid) > 0) return null;
      // More unregistered orders = bigger data gap. Each 5 orders = +20, cap 80.
      const bonus = clamp(Math.floor(recentOrders / 5) * 20, 0, 80);
      return {
        score:     PRIORITY_WEIGHTS.medium + bonus,
        finding:   `Tienes ${recentOrders} pedidos este mes, pero ninguno está marcado como pagado.`,
        alert:     'Sin pagos registrados, tus reportes de ingresos están incompletos.',
        action:    'Actualiza el estado de los pedidos cobrados para mantener métricas precisas.',
        ctaLabel:  'Ver pedidos',
        ctaTarget: '/orders',
      };
    },
  },

  // ─ traffic ────────────────────────────────────────────────────────────────────
  {
    id: 'dominant_source',
    category: 'traffic',
    priority: 'medium',
    evaluate({ sourceBreakdown, visits30d }) {
      if (visits30d < 10) return null;
      const top = topSourceEntry(sourceBreakdown);
      if (!top) return null;
      const [src, cnt] = top;
      if (src === 'direct') return null;
      const total = breakdownTotal(sourceBreakdown);
      const pct = Math.round((cnt / total) * 100);
      if (pct < 70) return null;
      // Each percentage point above 70 adds 2, cap 60.
      const bonus = clamp((pct - 70) * 2, 0, 60);
      const label = getSourceLabel(src);
      return {
        score:     PRIORITY_WEIGHTS.medium + bonus,
        finding:   `El ${pct}% de tus visitas este mes proviene de ${label} (${cnt} de ${visits30d}).`,
        alert:     `Depender de ${label} como única fuente es un riesgo si ese canal cambia o se interrumpe.`,
        action:    `Diversifica compartiendo el catálogo en al menos un canal adicional junto con ${label}.`,
        ctaLabel:  'Ver analytics',
        ctaTarget: '/dashboard',
      };
    },
  },

  {
    id: 'only_direct_traffic',
    category: 'traffic',
    priority: 'medium',
    evaluate({ sourceBreakdown, visits30d }) {
      if (visits30d < 10) return null;
      const keys = Object.keys(sourceBreakdown || {});
      if (keys.length !== 1 || keys[0] !== 'direct') return null;
      // More blind traffic = more optimization potential. Each 10 visits = +10, cap 60.
      const bonus = clamp(Math.floor(visits30d / 10) * 10, 0, 60);
      return {
        score:     PRIORITY_WEIGHTS.medium + bonus,
        finding:   `Las ${visits30d} visitas del mes llegaron sin origen identificado (tráfico directo).`,
        alert:     'Sin datos de origen no puedes saber qué publicaciones o campañas generan visitas.',
        action:    'Agrega ?utm_source=instagram al link que compartes en redes para identificar cada fuente.',
        ctaLabel:  'Ver analytics',
        ctaTarget: '/dashboard',
      };
    },
  },

  // ─ growth ─────────────────────────────────────────────────────────────────────
  {
    id: 'traffic_accelerating',
    category: 'growth',
    priority: 'positive',
    evaluate({ visits7d, visits30d }) {
      if (visits30d < 20 || visits7d < visits30d * 0.4) return null;
      // Stronger acceleration = higher signal. Scale from ratio 0.4 → 0.8+, cap 80.
      const bonus = clamp(Math.round((visits7d / visits30d - 0.4) * 200), 0, 80);
      const avg30 = Math.round(visits30d / 30);
      const avg7  = Math.round(visits7d  / 7);
      return {
        score:     PRIORITY_WEIGHTS.positive + bonus,
        finding:   `El tráfico se está acelerando: ${avg7} visitas/día esta semana vs. ${avg30} de promedio mensual.`,
        alert:     'Con más tráfico, es importante que el catálogo esté actualizado y con stock visible.',
        action:    'Verifica que los productos más populares tengan fotos y disponibilidad correctas.',
        ctaLabel:  'Gestionar productos',
        ctaTarget: '/product-management',
      };
    },
  },

  // ─ catalog ────────────────────────────────────────────────────────────────────
  {
    id: 'inactive_products',
    category: 'catalog',
    priority: 'low',
    evaluate({ inactiveProducts, activeProducts }) {
      if (inactiveProducts === 0 || activeProducts === 0) return null;
      // Each inactive product adds 8 to score, cap 50.
      const bonus = clamp(inactiveProducts * 8, 0, 50);
      const n = inactiveProducts;
      return {
        score:     PRIORITY_WEIGHTS.low + bonus,
        finding:   `Tienes ${n} producto${n !== 1 ? 's' : ''} desactivado${n !== 1 ? 's' : ''} en tu catálogo.`,
        alert:     'Los productos inactivos no aparecen en el catálogo y no generan ventas.',
        action:    'Actívalos si tienen stock disponible, o elimínalos para mantener el catálogo limpio.',
        ctaLabel:  'Gestionar productos',
        ctaTarget: '/product-management',
      };
    },
  },

  // ─ positive ───────────────────────────────────────────────────────────────────
  {
    id: 'healthy',
    category: 'positive',
    priority: 'positive',
    evaluate({ visits30d, recentOrders, activeProducts }) {
      if (visits30d === 0 || recentOrders === 0 || activeProducts === 0) return null;
      // Activity bonus: more visits + orders = higher score, cap 80.
      const bonus = clamp(
        Math.floor(visits30d / 10) * 5 + Math.floor(recentOrders / 3) * 5,
        0, 80,
      );
      const p = activeProducts;
      const v = visits30d;
      const o = recentOrders;
      return {
        score:     PRIORITY_WEIGHTS.positive + bonus,
        finding:   `Tu tienda está activa: ${p} producto${p !== 1 ? 's' : ''}, ${v} visitas y ${o} pedido${o !== 1 ? 's' : ''} en los últimos 30 días.`,
        alert:     'Sin alertas críticas por ahora. Todo parece estar funcionando.',
        action:    'Mantén el catálogo actualizado y responde pedidos rápido para sostener la conversión.',
        ctaLabel:  'Ver dashboard',
        ctaTarget: '/dashboard',
      };
    },
  },
];

// ── Fallback (no rules matched — not enough data) ─────────────────────────────

const FALLBACK_CANDIDATE = {
  id:        'no_data',
  category:  'setup',
  priority:  'low',
  score:     0,
  finding:   'Comienza a recibir visitas y pedidos para ver insights personalizados aquí.',
  alert:     'Sin alertas por ahora.',
  action:    'Comparte el link de tu catálogo en tus redes sociales para atraer tus primeras visitas.',
  ctaLabel:  'Ver dashboard',
  ctaTarget: '/dashboard',
};

// ── Data quality & signals ────────────────────────────────────────────────────

function computeSignalsUsed(safe) {
  const checks = [
    [safe.visits30d > 0,                                'visits'],
    [safe.recentOrders > 0,                             'orders'],
    [safe.conversionFunnel != null,                     'funnel'],
    [Object.keys(safe.sourceBreakdown).length > 0,      'sources'],
    [safe.activeProducts + safe.inactiveProducts > 0,   'products'],
    [safe.monthlyRevenue != null,                       'revenue'],
  ];
  return checks.filter(([cond]) => cond).map(([, label]) => label);
}

function computeDataQuality(safe) {
  const signals = computeSignalsUsed(safe).length;
  if (safe.visits30d >= 50 && safe.recentOrders >= 5 && signals >= 4) return 'high';
  if (safe.visits30d >= 10 || safe.recentOrders >= 2 || signals >= 3)  return 'medium';
  return 'low';
}

// ── Input normalization ───────────────────────────────────────────────────────

function normalize(data) {
  return {
    visits30d:          Number(data?.visits30d)          || 0,
    visits7d:           Number(data?.visits7d)           || 0,
    visitsToday:        Number(data?.visitsToday)        || 0,
    totalVisits:        Number(data?.totalVisits)        || 0,
    sourceBreakdown:    data?.sourceBreakdown            ?? {},
    activeProducts:     Number(data?.activeProducts)     || 0,
    inactiveProducts:   Number(data?.inactiveProducts)   || 0,
    recentOrders:       Number(data?.recentOrders)       || 0,
    pendingOrdersCount: Number(data?.pendingOrdersCount) || 0,
    weeklyOrdersCount:  Number(data?.weeklyOrdersCount)  || 0,
    conversionFunnel:   data?.conversionFunnel           ?? null,
    monthlyRevenue:     data?.monthlyRevenue             ?? null,
    // Optional: used to build the catalog CTA URL for visits_no_orders
    businessSlug:       data?.businessSlug               ?? null,
  };
}

// ── V2 entry point ────────────────────────────────────────────────────────────

/**
 * Generate a scored, multi-insight analysis from dashboard data.
 *
 * @param {{
 *   visits30d: number, visits7d: number, visitsToday: number, totalVisits: number,
 *   sourceBreakdown: Record<string,number>|null,
 *   activeProducts: number, inactiveProducts: number,
 *   recentOrders: number, pendingOrdersCount: number, weeklyOrdersCount: number,
 *   conversionFunnel: object|null, monthlyRevenue: object|null,
 *   businessSlug?: string,
 * }} data
 *
 * @returns {{
 *   primary:   { id, priority, score, category, finding, alert, action, ctaLabel, ctaTarget },
 *   secondary: Array<{ id, priority, score, category, finding, alert, action, ctaLabel, ctaTarget }>,
 *   meta:      { generatedAt: string, dataQuality: 'low'|'medium'|'high', signalsUsed: string[], source: 'local' }
 * }}
 */
export function generateInsightsV2(data) {
  const safe = normalize(data);

  const candidates = RULES_V2
    .map(rule => {
      const result = rule.evaluate(safe);
      if (!result) return null;
      return { id: rule.id, category: rule.category, priority: rule.priority, ...result };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const primary = candidates[0] ?? FALLBACK_CANDIDATE;

  // Allow up to 2 secondaries; skip same category as primary to avoid redundancy.
  const secondary = candidates
    .slice(1)
    .filter(c => c.category !== primary.category)
    .slice(0, 2);

  return {
    primary,
    secondary,
    meta: {
      generatedAt:  new Date().toISOString(),
      dataQuality:  computeDataQuality(safe),
      signalsUsed:  computeSignalsUsed(safe),
      source:       'local',
    },
  };
}

// ── V1 compatibility ──────────────────────────────────────────────────────────

/**
 * Thin wrapper over generateInsightsV2.
 * Returns the legacy shape expected by AiInsightsCard.
 *
 * @returns {{ hallazgo, alerta, accion, prioridad, generated_at, source: 'local' }}
 */
export function generateInsights(data) {
  const { primary, meta } = generateInsightsV2(data);
  return {
    hallazgo:     primary.finding,
    alerta:       primary.alert,
    accion:       primary.action,
    prioridad:    PRIORITY_TO_LEGACY[primary.priority] ?? 'baja',
    generated_at: meta.generatedAt,
    source:       'local',
  };
}
