// Errores de dominio del emisor fiscal. Los códigos son estables: los tests y el
// frontend (vía respuesta HTTP) los usan para decidir qué mostrar. Nunca incluyen secretos.

export class FiscalError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'FiscalError';
    this.code = code;
  }
}

// El proveedor respondió explícitamente que rechaza el documento. Es el único caso
// que permite pasar a 'failed' sin reconciliación.
export class ProviderRejectedError extends Error {
  constructor(message = 'provider rejected document') {
    super(message);
    this.name = 'ProviderRejectedError';
    this.code = 'PROVIDER_REJECTED';
  }
}

// El proveedor no respondió dentro del plazo: el resultado es desconocido.
export class ProviderTimeoutError extends Error {
  constructor(ms) {
    super(`provider timeout after ${ms} ms`);
    this.name = 'ProviderTimeoutError';
    this.code = 'PROVIDER_TIMEOUT';
  }
}

// El contrato de DTECore no está verificado: el adaptador bloqueado lanza esto
// y nunca hace llamadas de red.
export class ContractNotVerifiedError extends Error {
  constructor(message = 'DTECore contract not verified') {
    super(message);
    this.name = 'ContractNotVerifiedError';
    this.code = 'CONTRACT_NOT_VERIFIED';
  }
}
