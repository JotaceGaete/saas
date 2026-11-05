// Proveedor simulado para desarrollo y pruebas. NO hace red ni emite nada real.
// Escenarios: ok | rejected | timeout | network | no_pdf | no_folio.
// Mantiene un contador de llamadas para que las pruebas afirmen "0 llamadas al proveedor".

import { ProviderRejectedError } from '../errors.mjs';

// identityFor(apiKey) -> RUT que el proveedor simulado informa como dueño de esa API key
// (migración H). Sin identityFor, verifyIdentity no informa RUT.
export function createSimulatedProvider({ scenario = 'ok', folioStart = 1000, delayMs = 0, identityFor = null } = {}) {
  let calls = 0;
  let identityCalls = 0;
  let next = folioStart;
  const byOperation = new Map(); // simula idempotencia por idBoletaOperacion

  async function emit({ payload }) {
    calls += 1;
    const sc = typeof scenario === 'function' ? scenario(calls, payload) : scenario;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));

    if (sc === 'timeout') {
      // Nunca resuelve: el orquestador debe cortar por plazo y marcar unknown.
      return new Promise(() => {});
    }
    if (sc === 'network') {
      throw Object.assign(new Error('simulated ECONNRESET'), { code: 'ECONNRESET' });
    }
    if (sc === 'rejected') {
      throw new ProviderRejectedError('simulated rejection');
    }

    const opId = payload.idBoletaOperacion;
    if (byOperation.has(opId)) return byOperation.get(opId); // mismo folio para la misma operación

    const folio = next++;
    const doc = {
      folio: sc === 'no_folio' ? null : folio,
      xmlBase64: 'PERURS8+', // "<DTE/>" en base64 válido (antes era base64 mal formado)
      pdfBase64: sc === 'no_pdf' ? null : 'JVBERi0xLjQK',
    };
    byOperation.set(opId, doc);
    return doc;
  }

  async function verifyIdentity({ credentials }) {
    identityCalls += 1;
    const rut = typeof identityFor === 'function' ? identityFor(credentials?.apiKey) : null;
    return { rut: rut ?? null };
  }

  return {
    name: 'simulated',
    emit,
    identityContractVerified: true,
    verifyIdentity,
    get identityCalls() {
      return identityCalls;
    },
    get calls() {
      return calls;
    },
    reset() {
      calls = 0;
    },
  };
}
