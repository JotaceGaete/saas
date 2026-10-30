/**
 * Interpret DTE Core's successful HTTP issuance response without treating it
 * as proof of SII acceptance. Pure function; no network or secrets.
 */
export function normalizeDteCoreIssuanceResponse(body, { expectedSimulation } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid DTE Core issuance response');
  }
  if (!Number.isSafeInteger(body.folio) || body.folio <= 0) {
    throw new Error('DTE Core response has no valid folio; reconcile before retrying');
  }
  if (typeof body.esSimulacion !== 'boolean') {
    throw new Error('DTE Core response has no simulation flag; reconcile before retrying');
  }
  if (typeof expectedSimulation === 'boolean' && body.esSimulacion !== expectedSimulation) {
    throw new Error('DTE Core environment mismatch; do not retry issuance');
  }
  const pdf = body.documentos?.pdf;
  const xml = body.documentos?.xml;
  const validUrl = (value, suffix) => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'api.siisolutions.cl' ||
          url.username || url.password || url.search || url.hash ||
          !url.pathname.endsWith(suffix)) return null;
      return url.toString();
    } catch { return null; }
  };
  const folio = body.folio;
  return {
    folio,
    isSimulation: body.esSimulacion,
    pdfStatus: typeof body.pdfEstado === 'string' ? body.pdfEstado : 'unknown',
    pdfUrl: validUrl(pdf, `/dte/documentos/39/${folio}/pdf`),
    xmlUrl: validUrl(xml, `/dte/documentos/39/${folio}/xml`),
    hasInlinePdf: typeof body.pdfBase64 === 'string' && body.pdfBase64.length > 0,
    hasInlineXml: typeof body.xmlBase64 === 'string' && body.xmlBase64.length > 0,
    // HTTP success and folio assignment are NOT evidence of SII acceptance.
    siiStatus: 'unverified',
    needsReconciliation: true,
  };
}
