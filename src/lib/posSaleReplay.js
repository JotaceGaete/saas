// La RPC crm_create_pos_sale es idempotente por clave: si la clave ya generó
// una venta, devuelve ESA venta. Es lo correcto para un reintento del mismo
// cobro (segundos o minutos después), pero no si la clave llegó desde un
// borrador viejo o de otra venta: entonces el TPV mostraría como registrada
// una venta anterior (10-11-2026: $1.500 mostrados como NV-0067 de $1.000).
//
// Una respuesta con otro total, o de una venta creada hace más de 30 minutos,
// no corresponde a este cobro.
export const STALE_REPLAY_MAX_AGE_MS = 30 * 60 * 1000;

export function isStaleSaleReplay(invoice, expectedTotal, { now = Date.now(), maxAgeMs = STALE_REPLAY_MAX_AGE_MS } = {}) {
  if (!invoice) return false;
  const got = Number(invoice.total);
  const want = Number(expectedTotal);
  if (invoice.total != null && Number.isFinite(got) && Number.isFinite(want) && Math.round(got) !== Math.round(want)) return true;
  const createdAt = Date.parse(invoice.created_at);
  if (Number.isFinite(createdAt) && now - createdAt > maxAgeMs) return true;
  return false;
}
