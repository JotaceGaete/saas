// Offline adapter from an immutable issued-document registry to the scoped folio ledger.
// Do not infer a fiscal issue from a paid sale or a credit note.
import {reconcileScopedFolios} from './reconcile-scoped-folios.mjs';
export function summarizeRegisteredBoletas({issuerRut,documentType,day,documents}={}) {
  if(!Array.isArray(documents)) throw Error('DOCUMENTS_REQUIRED');
  const entries=documents.map(d=>{
    if(!d||d.issuerRut!==issuerRut||d.documentType!==documentType||d.day!==day)
      throw Error('DOCUMENT_SCOPE_MISMATCH');
    if(d.status==='issued'){
      if(d.siiAccepted!==true) throw Error('ISSUED_DOCUMENT_NOT_ACCEPTED');
      if(d.creditNoteApplied===true && d.folioStatus==='voided') throw Error('CREDIT_NOTE_IS_NOT_FOLIO_VOID');
      return {issuerRut,documentType,day,folio:d.folio,status:'issued',amount:d.gross,exemptAmount:d.exemptGross??0};
    }
    if(d.status==='voided_folio'){
      if(d.siiAccepted===true||d.creditNoteApplied===true) throw Error('CANNOT_VOID_ISSUED_FOLIO');
      return {issuerRut,documentType,day,folio:d.folio,status:'voided'};
    }
    throw Error('UNRECOGNIZED_DOCUMENT_STATE');
  });
  return reconcileScopedFolios({issuerRut,documentType,day,entries});
}
