// Adaptador HTTP para el endpoint de boletas del contrato SII Solutions (colección Postman
// "FacturacionElectronica_API", POST /dte/boletas/emitir). NO está activo: `ready` es false y
// ningún entorno lo registra como proveedor. Se activará solo con autorización explícita.
//
// Supuestos del contrato que NO están verificados contra un entorno real (ver informe):
//   - Autenticación: cabecera X-Api-Key con la clave del negocio. La colección también muestra
//     POST /auth/api-key/login, cuya respuesta no está documentada; no se usa aquí.
//   - El cuerpo debe completarse con los campos del ejemplo oficial (cliente, fechaEmision, total…)
//     antes de activarlo. Este adaptador envía el payload que recibe, sin inventar campos.
//
// Clasificación de resultados (regla de seguridad: ante la duda, UNKNOWN, nunca FAILED):
//   200 con folio/XML/PDF           -> documento
//   200 con esSimulacion=true       -> error PROVIDER_SIMULATION (no es una emisión real)
//   400 con success=false           -> ProviderRejectedError (el proveedor rechazó; no hay folio)
//   401                             -> error PROVIDER_AUTH (nada emitido, pero requiere revisión)
//   cualquier otro estado / red     -> error PROVIDER_HTTP_<status> o de red (unknown en el emisor)

import { ProviderRejectedError } from '../errors.mjs';

export const SIISOLUTIONS_EMIT_PATH = '/dte/boletas/emitir';
const DEFAULT_TIMEOUT_MS = 20_000;

function assertSafeBaseUrl(baseUrl) {
  let u;
  try { u = new URL(baseUrl); } catch { throw new Error('baseUrl inválida'); }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !(loopback && u.protocol === 'http:')) {
    throw new Error('baseUrl debe ser https (http solo en loopback para pruebas)');
  }
  return u.origin;
}

function classedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function createSiisolutionsHttpProvider({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ready = false, // false por defecto; la función solo lo pone en true con FISCAL_PROVIDER=siisolutions
} = {}) {
  const origin = assertSafeBaseUrl(baseUrl);
  return {
    name: 'siisolutions',
    ready: ready === true,
    async emit({ payload, credentials }) {
      if (!credentials?.apiKey) throw classedError('PROVIDER_AUTH', 'missing api key');
      const res = await fetchImpl(`${origin}${SIISOLUTIONS_EMIT_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'X-Api-Key': credentials.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }

      if (res.status === 200) {
        if (body?.esSimulacion === true) throw classedError('PROVIDER_SIMULATION', 'provider returned a simulation');
        return {
          folio: body?.folio ?? null,
          xmlBase64: body?.xmlBase64 ?? null,
          pdfBase64: body?.pdfBase64 ?? null,
        };
      }
      if (res.status === 400 && body?.success === false) {
        // El proveedor rechazó explícitamente el documento; no se generó folio.
        throw new ProviderRejectedError(`provider rejected: ${String(body.error ?? 'validation').slice(0, 200)}`);
      }
      if (res.status === 401) throw classedError('PROVIDER_AUTH', 'provider authentication failed');
      throw classedError(`PROVIDER_HTTP_${res.status}`, `provider returned HTTP ${res.status}`);
    },
  };
}
