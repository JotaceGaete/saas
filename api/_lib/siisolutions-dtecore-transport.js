/**
 * Read-only DTECore document transport.
 * Requires the exact folio returned by a trusted 409 conflict or stored ledger.
 * Never issues a DTE and never accepts a browser-supplied API key.
 */
export function createDteCoreDocumentTransport({
  apiKey, baseUrl = 'https://api.siisolutions.cl', fetchImpl = fetch,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() ||
      typeof fetchImpl !== 'function') throw new Error('Server-only DTECore credentials required');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/' ||
      base.hostname !== 'api.siisolutions.cl' || base.port) {
    throw new Error('Invalid DTECore base URL');
  }
  const origin = base.origin;
  async function getDocument(folio, format) {
    if (!Number.isSafeInteger(folio) || folio <= 0 ||
        !['xml','pdf'].includes(format)) throw new Error('Invalid document lookup');
    const url = new URL('/dte/documentos/39/' + folio + '/' + format, origin);
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { ok:false, status:response.status };
    const body = await response.json();
    return { ok:true, body };
  }
  return {
    getXml(folio) { return getDocument(folio,'xml'); },
    getPdf(folio) { return getDocument(folio,'pdf'); },
  };
}
