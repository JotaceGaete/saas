// Límite de espera de las llamadas del TPV a Mercado Pago Point.
//
// Causa del bloqueo (P0, 11-11-2026): las llamadas a mp-point-* no tenían
// límite. Si Mercado Pago o la terminal no respondían, `await` quedaba
// pendiente: «Cancelando…» no terminaba nunca y la consulta de estado se
// detenía sin volver a programarse. Con un límite, cada llamada termina siempre
// en { data, error } y el TPV recupera el control.
//
// Un límite vencido NO dice nada del cobro: el pago puede haberse aprobado o
// cancelado en Mercado Pago. Quien llama debe tratarlo como estado incierto
// (seguir consultando), nunca como cancelado.

export const POINT_TIMEOUTS_MS = Object.freeze({
  create: 25000,
  get: 12000,
  cancel: 20000,
});

export const POINT_TIMEOUT_REASON = 'CLIENT_TIMEOUT';

export function withPointTimeout(promise, ms, message = 'Mercado Pago no respondió a tiempo.') {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ data: null, error: { message, reason: POINT_TIMEOUT_REASON, timeout: true } }), ms);
  });
  const guarded = Promise.resolve(promise)
    .then((r) => r ?? { data: null, error: { message: 'Respuesta vacía de Mercado Pago Point.' } })
    .catch((err) => ({ data: null, error: { message: err?.message || 'No se pudo comunicar con Mercado Pago Point.', reason: 'CLIENT_NETWORK' } }));
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}
