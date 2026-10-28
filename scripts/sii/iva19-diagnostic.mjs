// Diagnostic-only gross-inclusive 19% VAT arithmetic, NOT an SII-approved DTE calculator.
// No folio, signing, fiscal authorization or XML generation.
// Rounding policy is a hypothesis requiring verification against current SII rules.
const deny = reason => Object.freeze({ok:false,reason,fiscalEligible:false});
export function calculateInclusiveIva19Diagnostic(gross) {
  if (typeof gross !== 'number' || !Number.isSafeInteger(gross) || gross <= 0)
    return deny('INVALID_GROSS');
  // Integer half-up rounding for positive CLP: net = round(gross / 1.19).
  const g = BigInt(gross);
  const netBig = (g * 100n + 59n) / 119n;
  const ivaBig = g - netBig;
  if (netBig > BigInt(Number.MAX_SAFE_INTEGER) || ivaBig < 0n)
    return deny('ARITHMETIC_OVERFLOW');
  const net = Number(netBig), iva = Number(ivaBig);
  return Object.freeze({
    ok:true,fiscalEligible:false,gross,net,iva,ratePercent:19,
    rounding:'diagnostic-half-up-on-net',siiValidated:false
  });
}
export function assessSnapshotIva19Diagnostic(prepared) {
  if (prepared?.ok !== true || prepared.fiscalEligible !== false ||
      !prepared.snapshot || !Array.isArray(prepared.snapshot.lines))
    return deny('SNAPSHOT_NOT_PREPARED');
  const {snapshot} = prepared;
  if (!Number.isSafeInteger(snapshot.total) || snapshot.total <= 0 ||
      snapshot.lines.length === 0 || snapshot.lines.some(line =>
        line.taxCategory !== 'IVA_AFECTO_19' ||
        !Number.isSafeInteger(line.subtotal) || line.subtotal < 0))
    return deny('INVALID_LINES');
  let sum = 0n;
  for (const line of snapshot.lines) sum += BigInt(line.subtotal);
  if (sum !== BigInt(snapshot.total)) return deny('TOTAL_MISMATCH');
  // Document-level computation deliberately avoids per-line rounding drift.
  const breakdown = calculateInclusiveIva19Diagnostic(snapshot.total);
  if (!breakdown.ok) return breakdown;
  return Object.freeze({...breakdown,saleId:snapshot.saleId,calculationScope:'document'});
}
