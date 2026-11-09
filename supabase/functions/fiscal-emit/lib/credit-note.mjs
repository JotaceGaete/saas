// Nota de crédito (DTE 61) — SOLO DISEÑO. No emite, no llama al proveedor.
//
// Qué está verificado (colección oficial de DTE Core, docs/NOTA-CREDITO-DTE61.md):
//   - Existe POST /dte/notas-credito/emitir con codigoDte 61, idOperacion (NO idBoletaOperacion),
//     rutOperador, cliente, detalles y un arreglo "referencias".
//   - El ejemplo trae "referencias": [] VACÍO y la colección no documenta los nombres de los
//     campos de una referencia ni cómo DTE Core los lleva al XML.
// Por eso aquí solo se arma la referencia INTERNA con los nombres del esquema SII (Referencia:
// TpoDocRef, FolioRef, FchRef, CodRef, RazonRef) y la traducción al cuerpo de DTE Core lanza
// ContractNotVerifiedError. La base también bloquea el paso a sending (migración H).

import { ContractNotVerifiedError, FiscalError } from './errors.mjs';

export const CREDIT_NOTE_DTE = 61;
// Códigos de referencia SII: 1 anula el documento de referencia, 2 corrige texto, 3 corrige montos.
export const COD_REF = Object.freeze({ ANULA: 1, CORRIGE_TEXTO: 2, CORRIGE_MONTOS: 3 });

const santiagoDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(d));

// Referencia al documento original. original = fila issued del ledger (con su RUT emisor).
export function buildCreditNoteReference({ original, codRef, razonRef, amountTotal, saleTotal, alreadyCredited = 0 }) {
  if (!original || original.status !== 'issued' || !Number.isSafeInteger(original.folio) || original.folio <= 0
      || !original.issuerRut || !original.issuedAt) {
    throw new FiscalError('FISCAL_CREDIT_NOTE_ORIGINAL_NOT_ISSUED');
  }
  if (![1, 2, 3].includes(codRef)) throw new FiscalError('FISCAL_CREDIT_NOTE_INVALID');
  const razon = typeof razonRef === 'string' ? razonRef.trim() : '';
  if (razon.length < 1 || razon.length > 90) throw new FiscalError('FISCAL_CREDIT_NOTE_INVALID');
  if (!Number.isSafeInteger(amountTotal) || amountTotal < 0) throw new FiscalError('FISCAL_CREDIT_NOTE_INVALID');
  const remaining = Number(saleTotal) - Number(alreadyCredited);
  if (codRef === COD_REF.ANULA && (amountTotal !== Number(saleTotal) || Number(alreadyCredited) > 0)) {
    throw new FiscalError('FISCAL_CREDIT_NOTE_AMOUNT');
  }
  if (codRef === COD_REF.CORRIGE_MONTOS && (amountTotal <= 0 || amountTotal > remaining)) {
    throw new FiscalError('FISCAL_CREDIT_NOTE_AMOUNT');
  }
  if (codRef === COD_REF.CORRIGE_TEXTO && amountTotal !== 0) throw new FiscalError('FISCAL_CREDIT_NOTE_AMOUNT');
  return Object.freeze({
    issuerRut: original.issuerRut, // la NC la emite el MISMO contribuyente del documento original
    dteType: CREDIT_NOTE_DTE,
    amountTotal,
    referencia: Object.freeze({
      TpoDocRef: String(original.dteType ?? 39),
      FolioRef: String(original.folio),
      FchRef: santiagoDate(original.issuedAt),
      CodRef: codRef,
      RazonRef: razon,
    }),
  });
}

// Cuerpo para POST /dte/notas-credito/emitir: BLOQUEADO hasta confirmar con DTE Core cómo se
// envían las referencias (nombres de campos, formato de fecha, receptor de una NC de boleta).
export function toProviderCreditNoteBody() {
  throw new ContractNotVerifiedError('DTE Core credit note reference contract not verified');
}
