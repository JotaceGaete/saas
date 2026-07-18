import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * `date-fns`'s `format()` throws a RangeError on an invalid Date instead of
 * returning null — a malformed/unparseable timestamp (e.g. one a particular
 * browser's Date parser rejects) would otherwise crash the render. Guard it
 * the same way the rest of this file already guards duration calculations.
 */
export function formatOrderDateLabel(iso, pattern) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, pattern, { locale: es });
}

const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 24 * MIN_PER_HOUR;

/**
 * Formatea minutos totales: menos de 60 min, menos de 24 h, o d + h + m (omitir ceros).
 */
export function formatDurationMinutesLabel(totalMin) {
  if (totalMin < MIN_PER_HOUR) {
    return `${totalMin} min`;
  }
  if (totalMin < MIN_PER_DAY) {
    const h = Math.floor(totalMin / MIN_PER_HOUR);
    const m = totalMin % MIN_PER_HOUR;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  const d = Math.floor(totalMin / MIN_PER_DAY);
  const rem = totalMin % MIN_PER_DAY;
  const h = Math.floor(rem / MIN_PER_HOUR);
  const m = rem % MIN_PER_HOUR;
  const parts = [`${d}d`];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ');
}

/**
 * Preparación: createdAt → sentAt (ambos obligatorios).
 */
export function formatPreparationDurationLabel(order) {
  if (!order?.sentAt || !order?.createdAt) return null;
  const a = new Date(order.createdAt).getTime();
  const b = new Date(order.sentAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return formatDurationMinutesLabel(Math.floor((b - a) / 60000));
}

/**
 * Tramo envío → entrega: sentAt → deliveredAt (ambos obligatorios).
 */
export function formatDeliverySegmentDurationLabel(order) {
  if (!order?.deliveredAt || !order?.sentAt) return null;
  const a = new Date(order.sentAt).getTime();
  const b = new Date(order.deliveredAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return formatDurationMinutesLabel(Math.floor((b - a) / 60000));
}

/**
 * Duración pedido → entrega: `deliveredAt − createdAt` (min/h/d).
 *
 * Devuelve `null` si:
 * - falta `order.deliveredAt` o `order.createdAt`
 * - alguna fecha no parsea a número válido (NaN)
 * - `deliveredAt < createdAt` (dato inconsistente)
 *
 * En la tarjeta kanban, sin `deliveredAt` no se muestra duración ni hora de entrega
 * inventada; ver {@link getOrderCardTimeCaption}.
 */
export function formatDeliveryDurationLabel(order) {
  if (!order?.deliveredAt || !order?.createdAt) return null;
  const a = new Date(order.createdAt).getTime();
  const b = new Date(order.deliveredAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  const totalMin = Math.floor((b - a) / 60000);
  return formatDurationMinutesLabel(totalMin);
}

/**
 * Pedidos con `status === 'entregado'` y sin `deliveredAt` (p. ej. históricos sin `delivered_at`).
 * Útil para consola / scripts de inspección; no usar en UI de producción.
 */
export function filterDeliveredOrdersMissingDeliveredAt(orders) {
  return (orders || []).filter((o) => o?.status === 'entregado' && !o?.deliveredAt);
}

/**
 * Si `formatDeliveryDurationLabel` devolvería `null` para un entregado, indica el motivo.
 * Si la duración se mostraría, devuelve `null`.
 */
export function explainMissingDeliveryDurationLabel(order) {
  if ((order?.status || '') !== 'entregado') return null;
  if (!order?.createdAt) return 'missing_created_at';
  if (!order?.deliveredAt) return 'missing_delivered_at';
  const a = new Date(order.createdAt).getTime();
  const b = new Date(order.deliveredAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 'invalid_dates';
  if (b < a) return 'negative_span';
  return null;
}

/**
 * Texto de hora en tarjeta kanban.
 * - entregado con `deliveredAt`: "Entregado HH:mm" + duración si aplica.
 * - entregado sin `deliveredAt`: "Entregado (sin hora registrada)" (no se usa `createdAt` como hora de entrega).
 */
export function getOrderCardTimeCaption(order) {
  const s = order?.status || 'pedido';
  if (s === 'entregado') {
    if (order?.deliveredAt) {
      const hm = formatOrderDateLabel(order.deliveredAt, 'HH:mm');
      if (!hm) {
        return { primary: 'Entregado (sin hora registrada)', durationLabel: null };
      }
      return {
        primary: `Entregado ${hm}`,
        durationLabel: formatDeliveryDurationLabel(order),
      };
    }
    return {
      primary: 'Entregado (sin hora registrada)',
      durationLabel: null,
    };
  }

  const iso = getOrderCardDisplayTimeIso(order);
  const hm = formatOrderDateLabel(iso, 'HH:mm');
  if (!hm) return { primary: '', durationLabel: null };
  if (s === 'enviado') return { primary: `Enviado ${hm}`, durationLabel: null };
  if (s === 'pedido') return { primary: `Pedido ${hm}`, durationLabel: null };
  if (s === 'en_preparacion') return { primary: hm, durationLabel: null };
  return { primary: hm, durationLabel: null };
}

/**
 * ISO usado para HH:mm en tarjetas del tablero (excepto entregado: ver {@link getOrderCardTimeCaption}).
 * - entregado: solo `deliveredAt` (sin fallback a `createdAt`).
 * - enviado: sentAt (fallback createdAt).
 * - resto: createdAt.
 */
export function getOrderCardDisplayTimeIso(order) {
  if (!order) return null;
  if (order.status === 'entregado') {
    return order.deliveredAt || null;
  }
  if (order.status === 'enviado') {
    return order.sentAt || order.createdAt || null;
  }
  return order.createdAt || null;
}

/** Fecha principal en listados de historial según estado (entregado → deliveredAt, enviado → sentAt, etc.). */
export function getHistoryPrimaryDateIso(order) {
  if (!order) return null;
  const st = order.status || 'pedido';
  if (st === 'entregado') return order.deliveredAt || order.createdAt || null;
  if (st === 'enviado') return order.sentAt || order.createdAt || null;
  return order.createdAt || null;
}

/** Orden dentro de columna "En proceso" (preparación + enviado): enviado ordena por envío real. */
export function getPreparacionSortTimeMs(order) {
  if (!order) return 0;
  if (order.status === 'enviado') {
    const iso = order.sentAt || order.createdAt;
    const t = new Date(iso || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = new Date(order.createdAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Ordenar entregados: más reciente por hora de entrega (o createdAt como respaldo). */
export function getDeliveredSortTimeMs(order) {
  if (!order) return 0;
  const iso = order.deliveredAt || order.createdAt;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}
