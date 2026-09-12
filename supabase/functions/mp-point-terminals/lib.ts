// mp-point-terminals — MP-POINT-0.
// Funciones puras (sin Deno-only APIs) para mapear la respuesta de
// GET https://api.mercadopago.com/terminals/v1/list a un DTO seguro.
//
// MP-POINT-0 es una AUDITORÍA: no se asume todavía la forma exacta de la
// respuesta real de Mercado Pago (no hay documentación verificada a mano
// en este entorno, y no hay una cuenta MP conectada real para probar
// contra la API desde acá). Por eso el parser es deliberadamente
// tolerante sobre el nombre del campo que trae el array de terminales
// (`data` es lo más común en las APIs nuevas de Mercado Pago, pero se
// acepta `results`/`terminals` como alternativas ya vistas en otras
// APIs de MP) -- index.ts además loguea (sin tokens) las claves de nivel
// superior de la respuesta real para poder confirmar, contra el
// hardware físico (PAX A910), cuál es la forma real.

export interface TerminalDto {
  id: string | null;
  posId: string | null;
  storeId: string | null;
  externalPosId: string | null;
  operatingMode: string | null;
}

// Solo los 5 campos pedidos -- cualquier otro campo que Mercado Pago
// devuelva (si trajera algo sensible o irrelevante) se descarta acá,
// nunca llega más allá de esta función.
export function mapTerminal(raw: unknown): TerminalDto {
  const record = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const toStringOrNull = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return null;
  };
  return {
    id: toStringOrNull(record.id),
    posId: toStringOrNull(record.pos_id),
    storeId: toStringOrNull(record.store_id),
    externalPosId: toStringOrNull(record.external_pos_id),
    operatingMode: typeof record.operating_mode === 'string' ? record.operating_mode : null,
  };
}

export interface ParsedTerminalsList {
  terminals: TerminalDto[];
  total: number | null;
}

/**
 * Acepta el body YA parseado como JSON (`JSON.parse`, no la Response
 * cruda) para poder testearse sin fetch real. Nunca lanza: una forma
 * inesperada simplemente produce una lista vacía con total null, en vez
 * de romper el request completo -- ver punto 5 del ticket ("respuesta
 * inesperada" es un caso a manejar, no un throw).
 */
export function parseTerminalsListResponse(body: unknown): ParsedTerminalsList {
  const record = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
  const rawList = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.terminals)
        ? record.terminals
        : [];

  const paging = (record.paging && typeof record.paging === 'object') ? record.paging as Record<string, unknown> : null;
  const total = paging && typeof paging.total === 'number' ? paging.total : rawList.length;

  return {
    terminals: rawList.map(mapTerminal),
    total,
  };
}
