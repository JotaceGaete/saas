// Adaptador real de DTECore BLOQUEADO hasta que el contrato esté verificado por escrito
// (F2 §5: idempotencia con idBoletaOperacion repetido, respuesta de PDF, endpoint de estado).
// No hace ninguna llamada de red. Cualquier intento lanza ContractNotVerifiedError.

import { ContractNotVerifiedError } from '../errors.mjs';

export function createDtecoreBlockedProvider() {
  return {
    name: 'dtecore',
    ready: false, // el emisor rechaza antes de reclamar la venta
    identityContractVerified: false,
    async verifyIdentity() {
      throw new ContractNotVerifiedError('DTECore identity endpoint contract not verified');
    },
    async emit() {
      throw new ContractNotVerifiedError(
        'DTECore emission blocked: idempotency and PDF response contract not verified',
      );
    },
  };
}
