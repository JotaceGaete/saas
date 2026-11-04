// Adaptador real de DTE Core (SII Solutions) para DTE 39. Solo servidor: la clave del comercio
// llega descifrada desde el reclamo (fiscal.business_credentials) y nunca sale de la función.
//
// Contrato usado (ver lib/payload.mjs y docs/fiscal/DTE39_TPV_INTEGRACION.md):
//   POST {origin}/dte/boletas/emitir            cabecera X-Api-Key, cuerpo JSON (lib/payload.mjs)
//   GET  {origin}/dte/documentos/39/{folio}/xml  solo lectura, para recuperar el XML si no vino inline
//   GET  {origin}/dte/documentos/39/{folio}/pdf  idem para el PDF
// Respuesta 2xx observada en la emisión aceptada (51106): folio, esSimulacion, documentos.{xml,pdf}
// y opcionalmente xmlBase64 / pdfBase64 inline.
// 409 con folioExistente: la operación (idBoletaOperacion) ya existía en el proveedor.
//
// Clasificación (ante la duda, UNKNOWN; nunca se reintenta la emisión):
//   2xx + folio + esSimulacion === false + XML/PDF válidos     -> documento (issued)
//   2xx con folio pero sin documentos válidos                  -> unknown, con folio
//   2xx con esSimulacion !== false                              -> unknown (PROVIDER_SIMULATION / RESPONSE_INVALID)
//   400 con success === false                                   -> rechazo explícito (failed, sin folio)
//   409                                                         -> unknown, con folioExistente si viene
//   401/403, otro estado, red o timeout                         -> unknown
//
// "Emitido" aquí significa que el proveedor asignó folio y devolvió el XML firmado. NO significa
// aceptado por el SII: ese estado se registra aparte (sii_status, ver migración E).

import { Buffer } from 'node:buffer';
import { ProviderRejectedError } from '../errors.mjs';

export const DTECORE_PRODUCTION_ORIGIN = 'https://api.siisolutions.cl';
export const SIISOLUTIONS_EMIT_PATH = '/dte/boletas/emitir';
export const documentPath = (folio, kind) => `/dte/documentos/39/${folio}/${kind}`;
// Consultas de solo lectura (GET). Ninguna emite, reenvía ni anula.
//   Operación por idBoletaOperacion: endpoint presente en la colección Postman, sin ejemplo de
//   respuesta. Ver lookupOperation: solo se acepta un folio explícito; lo demás es indeterminado.
//   Estado de envío al SII de un folio: ver getSiiStatus y mapSiiStatus.
export const operationPath = (operationId) => `/dte/operaciones/39/${encodeURIComponent(operationId)}`;
export const siiStatusPath = (folio) => `/dte/emitidos/39/${folio}/envio-sii`;
const OPERATION_ID = /^[A-Za-z0-9-]{1,100}$/;
const DEFAULT_TIMEOUT_MS = 20_000;
const DOCS_TIMEOUT_MS = 12_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function assertSafeBaseUrl(baseUrl) {
  let u;
  try { u = new URL(baseUrl); } catch { throw new Error('baseUrl inválida'); }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (loopback && (u.protocol === 'http:' || u.protocol === 'https:')) return u.origin; // solo pruebas
  if (u.protocol !== 'https:' || u.origin !== DTECORE_PRODUCTION_ORIGIN || u.username || u.password) {
    throw new Error(`baseUrl debe ser ${DTECORE_PRODUCTION_ORIGIN} (o loopback en pruebas)`);
  }
  return u.origin;
}

export class ProviderUnknownError extends Error {
  constructor(code, { folio = null, message } = {}) {
    super(message ?? code);
    this.name = 'ProviderUnknownError';
    this.code = code;
    this.folio = Number.isSafeInteger(folio) && folio > 0 ? folio : null;
  }
}

const isB64 = (v) => typeof v === 'string' && v.length > 0 && BASE64.test(v);

// Lee los campos clave del XML firmado. No valida la firma (eso lo hace el SII y, para la
// representación impresa, PR #112): verifica que el documento sea el que pedimos.
export function inspectDteXml(xmlBase64) {
  if (!isB64(xmlBase64)) return null;
  const xml = Buffer.from(xmlBase64, 'base64').toString('latin1');
  if (!xml.includes('<DTE') || !xml.includes('</DTE>')) return null;
  const tag = (name) => {
    const m = xml.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`));
    return m ? m[1] : null;
  };
  const int = (name) => {
    const v = tag(name);
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  };
  return {
    tipoDte: int('TipoDTE'),
    folio: int('Folio'),
    fchEmis: tag('FchEmis'),
    rutEmisor: tag('RUTEmisor'),
    mntNeto: int('MntNeto'),
    iva: int('IVA'),
    mntExe: int('MntExe'),
    mntTotal: int('MntTotal'),
    hasTed: xml.includes('<TED') && xml.includes('</TED>'),
    hasSignature: xml.includes('<Signature'),
  };
}

const normRut = (r) => String(r ?? '').replace(/\./g, '').toUpperCase();

// Un documento solo cuenta como emitido si el XML es el DTE 39 de ESE folio, de ESE emisor y por
// ESE total, con timbre, y el PDF es un PDF. Devuelve el motivo del rechazo o null si es válido.
export function documentProblem({ folio, xmlBase64, pdfBase64 }, expect = {}) {
  const info = inspectDteXml(xmlBase64);
  if (!info) return 'XML_INVALID';
  if (info.tipoDte !== 39) return 'XML_NOT_DTE39';
  if (info.folio !== folio) return 'XML_FOLIO_MISMATCH';
  if (!info.hasTed) return 'XML_WITHOUT_TED';
  if (expect.total != null && info.mntTotal !== expect.total) return 'XML_TOTAL_MISMATCH';
  if (expect.rutEmisor && normRut(info.rutEmisor) !== normRut(expect.rutEmisor)) return 'XML_ISSUER_MISMATCH';
  if (!isB64(pdfBase64) || Buffer.from(pdfBase64, 'base64').subarray(0, 5).toString('latin1') !== '%PDF-') {
    return 'PDF_INVALID';
  }
  return null;
}

const ALLOWED_DOC_TYPES = /^(application\/json|application\/xml|text\/xml|application\/pdf|application\/octet-stream|text\/plain)(;|$)/;
const DOC_FIELD = { xml: 'xmlBase64', pdf: 'pdfBase64' };

// Extrae un documento de una respuesta GET: bytes crudos, JSON con base64 o texto base64.
export function documentCandidate(kind, bytes, contentType) {
  const text = bytes.toString('latin1');
  if (contentType.startsWith('application/json')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    const value = parsed?.[DOC_FIELD[kind]] ?? parsed?.base64 ?? parsed?.contenido;
    return isB64(value) ? value : null;
  }
  if (kind === 'pdf' && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return bytes.toString('base64');
  if (kind === 'xml' && text.includes('<DTE')) return bytes.toString('base64');
  const trimmed = text.trim();
  return isB64(trimmed) ? trimmed : null;
}

const folioOfValue = (v) => {
  const n = typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : v;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const objectsOf = (body) => [body, body?.data, body?.resultado, body?.operacion, body?.result]
  .filter((o) => o && typeof o === 'object' && !Array.isArray(o));

/**
 * Interpreta la respuesta de GET /dte/operaciones/39/{idBoletaOperacion}. El formato no está
 * documentado, así que solo hay tres resultados y ante la duda gana 'indeterminate':
 *   found         2xx con un folio explícito, del tipo 39 si lo informa, de NUESTRA operación si
 *                 la informa, y no marcado como simulación.
 *   not_found     404. No es prueba de que no se emitió (el proveedor no lo ha confirmado): la venta
 *                 sigue bloqueada igual.
 *   indeterminate cualquier otra cosa (2xx sin folio, 401/403, 5xx, cuerpo ilegible...).
 */
export function parseOperationLookup(status, body, operationId) {
  if (status === 404) return { result: 'not_found' };
  if (status === 401 || status === 403) return { result: 'indeterminate', code: 'PROVIDER_AUTH' };
  if (status < 200 || status >= 300) return { result: 'indeterminate', code: `PROVIDER_HTTP_${status}` };
  const candidates = objectsOf(body);
  if (candidates.length === 0) return { result: 'indeterminate', code: 'RESPONSE_UNRECOGNIZED' };
  for (const o of candidates) {
    const folio = folioOfValue(o.folio ?? o.Folio ?? o.folioAsignado);
    if (!folio) continue;
    const tipo = o.codigoDte ?? o.tipoDte ?? o.TipoDTE;
    if (tipo != null && Number(tipo) !== 39) return { result: 'indeterminate', code: 'OPERATION_TYPE_MISMATCH' };
    const op = o.idBoletaOperacion ?? o.idOperacion;
    if (op != null && String(op) !== operationId) return { result: 'indeterminate', code: 'OPERATION_ID_MISMATCH' };
    if (o.esSimulacion === true) return { result: 'indeterminate', code: 'PROVIDER_SIMULATION' };
    return { result: 'found', folio };
  }
  return { result: 'indeterminate', code: 'OPERATION_WITHOUT_FOLIO' };
}

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const SII_FINAL = Object.freeze([
  [/^(ACEPTADO|ACEPTADA|ACCEPTED|DTE_ACEPTADO)$/, 'accepted'],
  [/^(ACEPTADO_CON_REPAROS|ACEPTADA_CON_REPAROS|CON_REPAROS|REPARO|ACCEPTED_WITH_OBJECTIONS)$/, 'accepted_with_objections'],
  [/^(RECHAZADO|RECHAZADA|REJECTED|DTE_RECHAZADO)$/, 'rejected'],
  [/^(RECIBIDO|RECIBIDA|ENVIADO|ENVIADA|EN_PROCESO|PROCESANDO|PENDIENTE|RECEIVED|SENT)$/, 'received'],
]);

/**
 * Interpreta GET /dte/emitidos/39/{folio}/envio-sii. Formato no documentado: solo se reconocen
 * estados escritos con palabras inequívocas (ACEPTADO, RECHAZADO, CON REPAROS, RECIBIDO...).
 * Códigos abreviados del SII (EPR, DOK, RCT...) u otro texto NO se interpretan: siiStatus = null y
 * la venta sigue «sin verificar» hasta revisar la respuesta real. Nunca se deduce «aceptada».
 */
export function mapSiiStatus(body) {
  let raw = null;
  let trackId = null;
  for (const o of objectsOf(body)) {
    raw ??= [o.estadoSii, o.estado, o.estadoEnvio, o.status].find((v) => typeof v === 'string' && v.trim()) ?? null;
    const t = o.trackId ?? o.trackid ?? o.track_id ?? o.TrackId;
    if (trackId == null && t != null && /^\d{1,20}$/.test(String(t))) trackId = String(t);
  }
  const normalized = raw ? plain(raw) : null;
  const rawState = normalized ? normalized.replace(/[^A-Z0-9_]/g, '').slice(0, 40) : null;
  // Se compara el texto completo, sin quitarle nada: «ACEPTADO?» o «ACEPTADO (parcial)» no cuentan.
  const hit = normalized && /^[A-Z_]{1,40}$/.test(normalized) ? SII_FINAL.find(([re]) => re.test(normalized)) : null;
  return { siiStatus: hit ? hit[1] : null, rawState, trackId };
}

export function createSiisolutionsHttpProvider({
  baseUrl = DTECORE_PRODUCTION_ORIGIN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  docsTimeoutMs = DOCS_TIMEOUT_MS,
  ready = false, // solo index.ts lo pone en true con FISCAL_PROVIDER=dtecore|siisolutions
} = {}) {
  const origin = assertSafeBaseUrl(baseUrl);

  async function getDocument(kind, folio, apiKey) {
    let res;
    try {
      res = await fetchImpl(`${origin}${documentPath(folio, kind)}`, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey, accept: '*/*' },
        redirect: 'error',
        signal: AbortSignal.timeout(docsTimeoutMs),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!ALLOWED_DOC_TYPES.test(contentType)) return null;
    return documentCandidate(kind, Buffer.from(await res.arrayBuffer()), contentType);
  }

  // Solo lectura. Nunca llama al POST de emisión.
  async function retrieveDocuments({ folio, credentials, expect = {} }) {
    if (!Number.isSafeInteger(folio) || folio <= 0 || !credentials?.apiKey) return null;
    const xmlBase64 = await getDocument('xml', folio, credentials.apiKey);
    const pdfBase64 = xmlBase64 ? await getDocument('pdf', folio, credentials.apiKey) : null;
    const doc = { folio, xmlBase64, pdfBase64 };
    return documentProblem(doc, expect) ? null : doc;
  }

  // GET JSON de solo lectura. Nunca lanza: { status, body } o { error } (red, plazo, tipo).
  async function getJson(path, apiKey) {
    let res;
    try {
      res = await fetchImpl(`${origin}${path}`, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(docsTimeoutMs),
      });
    } catch (err) {
      return { error: err?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK' };
    }
    const text = await res.text().catch(() => '');
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { status: res.status, body };
  }

  /** Consulta una operación por su idBoletaOperacion. Solo lectura: nunca emite. */
  async function lookupOperation({ operationId, credentials }) {
    if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId) || !credentials?.apiKey) {
      return { result: 'indeterminate', code: 'LOOKUP_INVALID' };
    }
    const r = await getJson(operationPath(operationId), credentials.apiKey);
    if (r.error) return { result: 'indeterminate', code: r.error };
    return parseOperationLookup(r.status, r.body, operationId);
  }

  /** Estado del envío al SII de un folio ya emitido. Solo lectura. */
  async function getSiiStatus({ folio, credentials }) {
    if (!Number.isSafeInteger(folio) || folio <= 0 || !credentials?.apiKey) return { result: 'indeterminate', code: 'SII_STATUS_INVALID' };
    const r = await getJson(siiStatusPath(folio), credentials.apiKey);
    if (r.error) return { result: 'indeterminate', code: r.error };
    if (r.status === 401 || r.status === 403) return { result: 'indeterminate', code: 'PROVIDER_AUTH' };
    if (r.status < 200 || r.status >= 300) return { result: 'indeterminate', code: `PROVIDER_HTTP_${r.status}` };
    return { result: 'ok', ...mapSiiStatus(r.body) };
  }

  return {
    name: 'dtecore',
    ready: ready === true,
    retrieveDocuments,
    lookupOperation,
    getSiiStatus,
    async emit({ payload, credentials, expect = {} }) {
      if (!credentials?.apiKey) throw new ProviderUnknownError('PROVIDER_AUTH', { message: 'missing api key' });
      let res;
      try {
        res = await fetchImpl(`${origin}${SIISOLUTIONS_EMIT_PATH}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'X-Api-Key': credentials.apiKey,
          },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Pudo haber llegado al proveedor: resultado desconocido.
        throw new ProviderUnknownError(err?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK');
      }

      const text = await res.text().catch(() => '');
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }
      const folioOf = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);

      if (res.status >= 200 && res.status < 300) {
        const folio = folioOf(body?.folio);
        if (!folio) throw new ProviderUnknownError('RESPONSE_WITHOUT_FOLIO');
        if (body.esSimulacion === true) throw new ProviderUnknownError('PROVIDER_SIMULATION', { folio });
        if (body.esSimulacion !== false) throw new ProviderUnknownError('RESPONSE_INVALID', { folio });

        const inline = { folio, xmlBase64: body.xmlBase64 ?? null, pdfBase64: body.pdfBase64 ?? null };
        if (isB64(inline.xmlBase64) && isB64(inline.pdfBase64)) {
          const problem = documentProblem(inline, expect);
          if (problem) throw new ProviderUnknownError(problem, { folio });
          return inline;
        }
        // Folio asignado sin documentos inline: se recuperan por GET (no emite).
        const retrieved = await retrieveDocuments({ folio, credentials, expect });
        if (!retrieved) throw new ProviderUnknownError('FOLIO_ASSIGNED_DOCUMENTS_NOT_RETRIEVED', { folio });
        return retrieved;
      }
      if (res.status === 400 && body?.success === false) {
        // Rechazo explícito de validación: el proveedor no asignó folio.
        throw new ProviderRejectedError(`provider rejected: ${String(body.error ?? 'validation').slice(0, 200)}`);
      }
      if (res.status === 409) {
        throw new ProviderUnknownError('PROVIDER_OPERATION_ALREADY_EXISTS', { folio: folioOf(body?.folioExistente) });
      }
      if (res.status === 401 || res.status === 403) throw new ProviderUnknownError('PROVIDER_AUTH');
      throw new ProviderUnknownError(`PROVIDER_HTTP_${res.status}`);
    },
  };
}

export const createDteCoreProvider = createSiisolutionsHttpProvider;
