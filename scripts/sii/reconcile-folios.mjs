// Offline folio reconciliation. No SII transmission or tax authorization.
export function reconcileFolios(entries) {
  if (!Array.isArray(entries)) throw Error('ENTRIES_REQUIRED');
  const seen = new Set();
  const result = {issued: 0, voided: 0, total: 0};
  for (const e of entries) {
    if (!e || !Number.isSafeInteger(e.folio) || e.folio <= 0 || seen.has(e.folio)) throw Error('INVALID_FOLIO');
    seen.add(e.folio);
    if (e.status === 'voided') {
      if (e.amount !== undefined) throw Error('VOIDED_WITH_AMOUNT');
      result.voided++;
    } else if (e.status === 'issued') {
      if (!Number.isSafeInteger(e.amount) || e.amount < 0) throw Error('INVALID_AMOUNT');
      result.issued++;
      result.total += e.amount;
      if (!Number.isSafeInteger(result.total)) throw Error('TOTAL_OVERFLOW');
    } else throw Error('INVALID_STATUS');
  }
  return Object.freeze({...result, used: seen.size, transmittable: false});
}
