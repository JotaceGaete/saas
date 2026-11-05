// Vinculación fiscal (C1, migración H): ¿a qué RUT pertenece esta API key de DTE Core?
//
// Única implementación, usada por la configuración fiscal (api/_lib/fiscal-connection.js) al
// guardar o volver a verificar la API key. Walinka hace la verificación; el comercio solo
// ingresa su RUT y su API key. El resultado se registra en la base
// (public.crm_fiscal_record_identity_check), que lo compara con el RUT del comercio y lo ata a la
// credencial vigente: cambiar la key o el RUT invalida la verificación.
//
// Estado del contrato: DTE Core NO documenta un endpoint de identidad (docs/CONTRATO-DTECORE.md §2).
// El adaptador real declara identityContractVerified = false, así que aquí se responde
// 'contract_pending' SIN llamar a la red. Nunca se interpreta una respuesta no documentada.

import { normalizeRut } from './allowlist.mjs';

export const IDENTITY_TIMEOUT_MS = 10_000;

/**
 * @returns {Promise<{status: 'contract_pending'} | {status: 'resolved', rut: string}
 *                   | {status: 'unavailable', reason: string}>}
 */
export async function resolveKeyOwnerRut({ provider, apiKey, timeoutMs = IDENTITY_TIMEOUT_MS }) {
  if (provider?.identityContractVerified !== true || typeof provider.verifyIdentity !== 'function') {
    return { status: 'contract_pending' };
  }
  if (typeof apiKey !== 'string' || apiKey === '') return { status: 'unavailable', reason: 'NO_API_KEY' };
  let timer;
  try {
    const r = await Promise.race([
      provider.verifyIdentity({ credentials: { apiKey } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'PROVIDER_TIMEOUT' })), timeoutMs); }),
    ]);
    const rut = normalizeRut(typeof r?.rut === 'string' ? r.rut : '');
    return rut ? { status: 'resolved', rut } : { status: 'unavailable', reason: 'UNREADABLE_IDENTITY' };
  } catch (err) {
    return { status: 'unavailable', reason: String(err?.code ?? 'ERROR').slice(0, 64) };
  } finally {
    clearTimeout(timer);
  }
}
