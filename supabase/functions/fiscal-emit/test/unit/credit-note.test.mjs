// Nota de crédito DTE 61: solo diseño (sin emisión ni red).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditNoteReference, toProviderCreditNoteBody, COD_REF } from '../../lib/credit-note.mjs';

const ORIGINAL = { status: 'issued', folio: 4321, issuerRut: '76123456-0', dteType: 39, issuedAt: '2026-11-05T15:00:00Z' };

test('NC: referencia SII al documento original del mismo emisor', () => {
  const r = buildCreditNoteReference({ original: ORIGINAL, codRef: COD_REF.CORRIGE_MONTOS, razonRef: 'Devolución parcial', amountTotal: 1190, saleTotal: 2380 });
  assert.equal(r.issuerRut, '76123456-0');
  assert.equal(r.dteType, 61);
  assert.deepEqual({ ...r.referencia }, { TpoDocRef: '39', FolioRef: '4321', FchRef: '2026-11-05', CodRef: 3, RazonRef: 'Devolución parcial' });
});

test('NC: reglas de monto por código de referencia', () => {
  const base = { original: ORIGINAL, razonRef: 'x', saleTotal: 2380 };
  assert.throws(() => buildCreditNoteReference({ ...base, codRef: 1, amountTotal: 100 }), { code: 'FISCAL_CREDIT_NOTE_AMOUNT' });
  assert.throws(() => buildCreditNoteReference({ ...base, codRef: 1, amountTotal: 2380, alreadyCredited: 10 }), { code: 'FISCAL_CREDIT_NOTE_AMOUNT' });
  assert.throws(() => buildCreditNoteReference({ ...base, codRef: 3, amountTotal: 2381 }), { code: 'FISCAL_CREDIT_NOTE_AMOUNT' });
  assert.throws(() => buildCreditNoteReference({ ...base, codRef: 3, amountTotal: 2000, alreadyCredited: 1000 }), { code: 'FISCAL_CREDIT_NOTE_AMOUNT' });
  assert.throws(() => buildCreditNoteReference({ ...base, codRef: 2, amountTotal: 5 }), { code: 'FISCAL_CREDIT_NOTE_AMOUNT' });
  assert.equal(buildCreditNoteReference({ ...base, codRef: 1, amountTotal: 2380 }).referencia.CodRef, 1);
  assert.equal(buildCreditNoteReference({ ...base, codRef: 2, amountTotal: 0 }).amountTotal, 0);
});

test('NC: sin documento original emitido no hay referencia', () => {
  for (const original of [null, { ...ORIGINAL, status: 'unknown' }, { ...ORIGINAL, folio: null }, { ...ORIGINAL, issuerRut: null }]) {
    assert.throws(() => buildCreditNoteReference({ original, codRef: 1, razonRef: 'x', amountTotal: 2380, saleTotal: 2380 }),
      { code: 'FISCAL_CREDIT_NOTE_ORIGINAL_NOT_ISSUED' });
  }
  assert.throws(() => buildCreditNoteReference({ original: ORIGINAL, codRef: 1, razonRef: 'x'.repeat(91), amountTotal: 2380, saleTotal: 2380 }),
    { code: 'FISCAL_CREDIT_NOTE_INVALID' });
});

test('NC: la traducción al cuerpo de DTE Core está bloqueada (contrato no verificado)', () => {
  assert.throws(() => toProviderCreditNoteBody(), { code: 'CONTRACT_NOT_VERIFIED' });
});
