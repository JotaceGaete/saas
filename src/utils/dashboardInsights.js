/**
 * Rule-based insight engine for the dashboard.
 *
 * Produces the same shape as AI-generated insights so it acts as a drop-in
 * fallback (or primary source when AI is disabled/unavailable):
 *   { hallazgo, alerta, accion, prioridad, generated_at, source: 'local' }
 *
 * Rules are evaluated in order; the first match wins.
 * To add a rule, push an entry to RULES — no other changes needed.
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

// ── Rule definitions ──────────────────────────────────────────────────────────
//
// Each rule has:
//   id      — unique key, useful for debugging / future A-B testing
//   match   — (safeData) => boolean
//   result  — (safeData) => { hallazgo, alerta, accion, prioridad }
//
// Priority guide:
//   alta   — needs action today (revenue or trust at risk)
//   media  — needs action this week (optimization opportunity)
//   baja   — informational / positive state

const RULES = [
  // ─ 1. No active products ────────────────────────────────────────────────────
  {
    id: 'no_active_products',
    match: ({ activeProducts }) => activeProducts === 0,
    result: () => ({
      prioridad: 'alta',
      hallazgo: 'Tu catálogo no tiene productos activos todavía.',
      alerta: 'Sin productos, los clientes que lleguen al catálogo no verán nada que comprar.',
      accion: 'Crea al menos un producto con foto y precio para activar tu tienda.',
    }),
  },

  // ─ 2. Visits but zero orders in 30d ─────────────────────────────────────────
  {
    id: 'visits_no_orders',
    match: ({ visits30d, recentOrders }) => visits30d >= 30 && recentOrders === 0,
    result: ({ visits30d }) => ({
      prioridad: 'alta',
      hallazgo: `Recibiste ${visits30d} visitas en los últimos 30 días, pero ninguna se convirtió en pedido.`,
      alerta: 'Algo en el catálogo puede estar frenando a los clientes: precio, fotos o proceso de contacto.',
      accion: 'Revisa que el botón de WhatsApp sea visible, los precios estén actualizados y las fotos sean claras.',
    }),
  },

  // ─ 3. Good traffic but very low WhatsApp click-through rate ─────────────────
  {
    id: 'low_wa_ctr',
    match: ({ visits30d, conversionFunnel }) =>
      visits30d >= 20 &&
      conversionFunnel != null &&
      Number(conversionFunnel.rateClickFromVisit) < 5,
    result: ({ visits30d, conversionFunnel }) => {
      const rate = Number(conversionFunnel.rateClickFromVisit).toFixed(1);
      return {
        prioridad: 'alta',
        hallazgo: `Solo el ${rate}% de tus ${visits30d} visitantes hace clic en WhatsApp.`,
        alerta: 'Un CTR bajo sugiere que el botón de contacto no es visible o que el producto no genera suficiente interés.',
        accion: 'Verifica que el botón de WhatsApp aparezca sin scroll en la vista inicial del catálogo.',
      };
    },
  },

  // ─ 4. Orders exist but none marked as paid ──────────────────────────────────
  {
    id: 'orders_not_paid',
    match: ({ recentOrders, conversionFunnel }) =>
      recentOrders >= 5 &&
      conversionFunnel != null &&
      Number(conversionFunnel.paid) === 0,
    result: ({ recentOrders }) => ({
      prioridad: 'media',
      hallazgo: `Tienes ${recentOrders} pedidos este mes, pero ninguno está marcado como pagado.`,
      alerta: 'Sin pagos registrados, tus reportes de ingresos están incompletos.',
      accion: 'Actualiza el estado de los pedidos cobrados para mantener métricas precisas.',
    }),
  },

  // ─ 5. One non-direct source dominates (≥ 70%) with enough volume ────────────
  {
    id: 'dominant_source',
    match: ({ sourceBreakdown, visits30d }) => {
      if (visits30d < 10) return false;
      const top = topSourceEntry(sourceBreakdown);
      if (!top) return false;
      const [src, cnt] = top;
      if (src === 'direct') return false;
      const pct = Math.round((cnt / breakdownTotal(sourceBreakdown)) * 100);
      return pct >= 70;
    },
    result: ({ sourceBreakdown, visits30d }) => {
      const [src, cnt] = topSourceEntry(sourceBreakdown);
      const pct = Math.round((cnt / breakdownTotal(sourceBreakdown)) * 100);
      const label = getSourceLabel(src);
      return {
        prioridad: 'media',
        hallazgo: `El ${pct}% de tus visitas este mes proviene de ${label} (${cnt} de ${visits30d}).`,
        alerta: `Concentrar todo el tráfico en ${label} es un riesgo si ese canal cambia o se interrumpe.`,
        accion: `Diversifica: prueba compartir tu catálogo en un segundo canal para no depender solo de ${label}.`,
      };
    },
  },

  // ─ 6. All traffic is direct — no campaign attribution ───────────────────────
  {
    id: 'only_direct_traffic',
    match: ({ sourceBreakdown, visits30d }) => {
      if (visits30d < 10) return false;
      const keys = Object.keys(sourceBreakdown || {});
      return keys.length === 1 && keys[0] === 'direct';
    },
    result: ({ visits30d }) => ({
      prioridad: 'media',
      hallazgo: `Las ${visits30d} visitas del mes llegaron sin origen identificado (tráfico directo).`,
      alerta: 'Sin datos de origen no puedes saber qué publicaciones o campañas generan visitas.',
      accion: 'Agrega ?utm_source=instagram al link que compartes en cada red social para identificar cada fuente.',
    }),
  },

  // ─ 7. Traffic accelerating (last 7d represents ≥ 40% of 30d) ───────────────
  {
    id: 'traffic_accelerating',
    match: ({ visits7d, visits30d }) =>
      visits30d >= 20 && visits7d >= visits30d * 0.4,
    result: ({ visits7d, visits30d }) => {
      const avg30 = Math.round(visits30d / 30);
      const avg7  = Math.round(visits7d  / 7);
      return {
        prioridad: 'baja',
        hallazgo: `El tráfico se está acelerando: ${avg7} visitas/día esta semana vs. ${avg30} de promedio en 30 días.`,
        alerta: 'Con más tráfico, es importante que el catálogo esté actualizado y con stock visible.',
        accion: 'Verifica que los productos más populares tengan fotos actualizadas y disponibilidad correcta.',
      };
    },
  },

  // ─ 8. Inactive products sitting idle ────────────────────────────────────────
  {
    id: 'inactive_products',
    match: ({ inactiveProducts, activeProducts }) =>
      inactiveProducts > 0 && activeProducts > 0,
    result: ({ inactiveProducts }) => ({
      prioridad: 'baja',
      hallazgo: `Tienes ${inactiveProducts} producto${inactiveProducts !== 1 ? 's' : ''} desactivado${inactiveProducts !== 1 ? 's' : ''} en tu catálogo.`,
      alerta: 'Los productos inactivos no aparecen en el catálogo público y no generan ventas.',
      accion: 'Actívalos si tienen stock disponible, o elimínalos para mantener el catálogo limpio y confiable.',
    }),
  },

  // ─ 9. Healthy baseline — everything looks good ──────────────────────────────
  {
    id: 'healthy',
    match: ({ visits30d, recentOrders, activeProducts }) =>
      visits30d > 0 && recentOrders > 0 && activeProducts > 0,
    result: ({ visits30d, recentOrders, activeProducts }) => ({
      prioridad: 'baja',
      hallazgo: `Tu tienda está activa: ${activeProducts} producto${activeProducts !== 1 ? 's' : ''}, ${visits30d} visitas y ${recentOrders} pedido${recentOrders !== 1 ? 's' : ''} en los últimos 30 días.`,
      alerta: 'Sin alertas críticas por ahora. Todo parece estar funcionando.',
      accion: 'Mantén el catálogo actualizado y responde pedidos rápido para sostener la conversión.',
    }),
  },
];

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Generate a rule-based insight from dashboard data.
 *
 * @param {{
 *   visits30d: number,
 *   visits7d: number,
 *   visitsToday: number,
 *   totalVisits: number,
 *   sourceBreakdown: Record<string, number> | null,
 *   activeProducts: number,
 *   inactiveProducts: number,
 *   recentOrders: number,
 *   pendingOrdersCount: number,
 *   weeklyOrdersCount: number,
 *   conversionFunnel: object | null,
 *   monthlyRevenue: object | null,
 * }} data
 *
 * @returns {{ hallazgo: string, alerta: string, accion: string, prioridad: string, generated_at: string, source: 'local' }}
 */
export function generateInsights(data) {
  const safe = {
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
  };

  for (const rule of RULES) {
    if (rule.match(safe)) {
      return {
        ...rule.result(safe),
        generated_at: new Date().toISOString(),
        source: 'local',
      };
    }
  }

  // Fallback: not enough data yet
  return {
    prioridad: 'baja',
    hallazgo: 'Comienza a recibir visitas y pedidos para ver insights personalizados aquí.',
    alerta: 'Sin alertas por ahora.',
    accion: 'Comparte el link de tu catálogo en tus redes sociales para atraer tus primeras visitas.',
    generated_at: new Date().toISOString(),
    source: 'local',
  };
}
