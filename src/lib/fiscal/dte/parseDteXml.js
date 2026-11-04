// Lector del XML de un DTE emitido por el proveedor (DTE Core / SII Solutions).
//
// Este módulo NO emite, NO firma y NO llama a ningún proveedor. Solo lee el
// documento auténtico ya emitido y extrae lo necesario para su
// representación impresa. Falla cerrado: si el XML no es coherente consigo
// mismo (encabezado vs. timbre vs. CAF), lanza DteXmlError y no se imprime
// nada.
//
// El TED (timbre electrónico) se extrae del TEXTO original, nunca
// re-serializado desde el DOM, para conservar exactamente los bytes que
// firmó el emisor. Solo se elimina el espacio en blanco ENTRE etiquetas
// (la forma en que se firmó el DD; verificado contra las boletas 51105 y
// 51106 reales).

export class DteXmlError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DteXmlError';
    this.code = code;
  }
}

export const SUPPORTED_DTE_TYPES = Object.freeze([39]);

const INT = /^-?\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RUT = /^\d{1,8}-[\dK]$/;

/**
 * Bytes del archivo XML -> texto, según la codificación declarada.
 * Los DTE del SII se emiten en ISO-8859-1; decodificar como UTF-8 (lo que
 * hace `Response.text()`) corrompería eñes y tildes del TED.
 * @param {ArrayBuffer|Uint8Array} bytes
 */
export function decodeDteBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder('latin1').decode(view.subarray(0, 200));
  const declared = /encoding=["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase();
  const encoding = !declared || declared === 'iso-8859-1' || declared === 'latin1' ? 'latin1' : declared;
  return new TextDecoder(encoding).decode(view);
}

/** Quita solo el espacio en blanco entre etiquetas. */
export function flattenXmlWhitespace(fragment) {
  return String(fragment).replace(/>\s+</g, '><').trim();
}

function children(el, name) {
  return Array.from(el?.children || []).filter((c) => c.localName === name);
}

function child(el, name) {
  return children(el, name)[0] || null;
}

function text(el, name) {
  const node = child(el, name);
  return node ? node.textContent.trim() : null;
}

function int(el, name, { required = false } = {}) {
  const value = text(el, name);
  if (value == null || value === '') {
    if (required) throw new DteXmlError('DTE_FIELD_MISSING', `${name} requerido`);
    return null;
  }
  if (!INT.test(value)) throw new DteXmlError('DTE_FIELD_INVALID', `${name} no es entero`);
  return Number(value);
}

function num(el, name) {
  const value = text(el, name);
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new DteXmlError('DTE_FIELD_INVALID', `${name} no es numérico`);
  return n;
}

function exactlyOne(raw, pattern, code) {
  const matches = raw.match(pattern) || [];
  if (matches.length !== 1) throw new DteXmlError(code, `se esperaba exactamente un elemento (${matches.length})`);
  return matches[0];
}

/**
 * @param {string} xmlText - XML completo del DTE (ya decodificado, ver decodeDteBytes)
 * @param {Object} [options]
 * @param {DOMParser} [options.DOMParserImpl]
 * @returns {ParsedDte}
 */
export function parseDteXml(xmlText, { DOMParserImpl = globalThis.DOMParser } = {}) {
  if (typeof xmlText !== 'string' || !xmlText.trim()) throw new DteXmlError('DTE_XML_EMPTY');
  if (typeof DOMParserImpl !== 'function') throw new DteXmlError('DTE_PARSER_UNAVAILABLE');
  // Un DTE nunca trae DOCTYPE; rechazarlo evita entidades externas o expansiones.
  if (/<!DOCTYPE/i.test(xmlText)) throw new DteXmlError('DTE_XML_DOCTYPE_NOT_ALLOWED');

  const doc = new DOMParserImpl().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DteXmlError('DTE_XML_MALFORMED');

  const root = doc.documentElement;
  if (root?.localName !== 'DTE') throw new DteXmlError('DTE_ROOT_INVALID');
  const documento = child(root, 'Documento');
  if (!documento) throw new DteXmlError('DTE_FIELD_MISSING', 'Documento requerido');
  const encabezado = child(documento, 'Encabezado');
  const idDoc = child(encabezado, 'IdDoc');
  const emisor = child(encabezado, 'Emisor');
  const receptor = child(encabezado, 'Receptor');
  const totales = child(encabezado, 'Totales');
  if (!idDoc || !emisor || !totales) throw new DteXmlError('DTE_FIELD_MISSING', 'Encabezado incompleto');

  const tipoDte = int(idDoc, 'TipoDTE', { required: true });
  if (!SUPPORTED_DTE_TYPES.includes(tipoDte)) throw new DteXmlError('DTE_TYPE_UNSUPPORTED', `TipoDTE ${tipoDte}`);
  const folio = int(idDoc, 'Folio', { required: true });
  if (folio <= 0) throw new DteXmlError('DTE_FIELD_INVALID', 'Folio');
  const fechaEmision = text(idDoc, 'FchEmis');
  if (!DATE.test(fechaEmision || '')) throw new DteXmlError('DTE_FIELD_INVALID', 'FchEmis');

  const rutEmisor = (text(emisor, 'RUTEmisor') || '').toUpperCase();
  if (!RUT.test(rutEmisor)) throw new DteXmlError('DTE_FIELD_INVALID', 'RUTEmisor');

  const items = children(documento, 'Detalle').map((det, i) => {
    const nombre = text(det, 'NmbItem');
    const monto = int(det, 'MontoItem', { required: true });
    if (!nombre) throw new DteXmlError('DTE_FIELD_MISSING', `NmbItem línea ${i + 1}`);
    return {
      linea: int(det, 'NroLinDet') ?? i + 1,
      nombre,
      descripcion: text(det, 'DscItem') || null,
      cantidad: num(det, 'QtyItem'),
      unidad: text(det, 'UnmdItem') || null,
      precio: num(det, 'PrcItem'),
      descuento: int(det, 'DescuentoMonto'),
      exento: text(det, 'IndExe') === '1',
      monto,
    };
  });
  if (items.length === 0) throw new DteXmlError('DTE_FIELD_MISSING', 'Detalle requerido');

  const parsed = {
    tipoDte,
    folio,
    fechaEmision,
    emisor: {
      rut: rutEmisor,
      razonSocial: text(emisor, 'RznSocEmisor') || text(emisor, 'RznSoc'),
      giro: text(emisor, 'GiroEmisor') || text(emisor, 'GiroEmis'),
      sucursal: text(emisor, 'Sucursal'),
      codigoSucursalSii: text(emisor, 'CdgSIISucur'),
      direccion: text(emisor, 'DirOrigen'),
      comuna: text(emisor, 'CmnaOrigen'),
      ciudad: text(emisor, 'CiudadOrigen'),
    },
    receptor: receptor ? {
      rut: (text(receptor, 'RUTRecep') || '').toUpperCase() || null,
      razonSocial: text(receptor, 'RznSocRecep'),
    } : null,
    totales: {
      neto: int(totales, 'MntNeto'),
      exento: int(totales, 'MntExe'),
      iva: int(totales, 'IVA'),
      total: int(totales, 'MntTotal', { required: true }),
    },
    items,
  };
  if (!parsed.emisor.razonSocial) throw new DteXmlError('DTE_FIELD_MISSING', 'RznSocEmisor');

  // Coherencia de montos declarados: neto + IVA + exento = total.
  const { neto, exento, iva, total } = parsed.totales;
  if ((neto ?? 0) + (iva ?? 0) + (exento ?? 0) !== total) {
    throw new DteXmlError('DTE_TOTALS_INCONSISTENT', 'MntNeto + IVA + MntExe != MntTotal');
  }

  // --- Timbre electrónico (TED), desde el texto original ---
  const tedRaw = exactlyOne(xmlText, /<TED\b[^>]*>[\s\S]*?<\/TED>/g, 'TED_NOT_FOUND');
  const ddRaw = exactlyOne(tedRaw, /<DD>[\s\S]*?<\/DD>/g, 'TED_DD_NOT_FOUND');
  const tedEl = child(documento, 'TED');
  const dd = child(tedEl, 'DD');
  const caf = child(dd, 'CAF');
  const da = child(caf, 'DA');
  const rng = child(da, 'RNG');
  const rsapk = child(da, 'RSAPK');
  const frmt = text(tedEl, 'FRMT');
  if (!dd || !da || !rng || !rsapk || !frmt) throw new DteXmlError('TED_INCOMPLETE');

  const ted = {
    xml: flattenXmlWhitespace(tedRaw),
    ddXml: flattenXmlWhitespace(ddRaw),
    frmt: frmt.replace(/\s+/g, ''),
    algoritmo: child(tedEl, 'FRMT').getAttribute('algoritmo'),
    timestamp: text(dd, 'TSTED'),
    caf: {
      rut: (text(da, 'RE') || '').toUpperCase(),
      razonSocial: text(da, 'RS'),
      tipoDte: int(da, 'TD'),
      desde: int(rng, 'D'),
      hasta: int(rng, 'H'),
      fechaAutorizacion: text(da, 'FA'),
      idk: int(da, 'IDK'),
      modulus: (text(rsapk, 'M') || '').replace(/\s+/g, ''),
      exponent: (text(rsapk, 'E') || '').replace(/\s+/g, ''),
    },
  };

  // El timbre debe describir exactamente este documento.
  const checks = [
    [(text(dd, 'RE') || '').toUpperCase() === rutEmisor, 'RE'],
    [int(dd, 'TD') === tipoDte, 'TD'],
    [int(dd, 'F') === folio, 'F'],
    [text(dd, 'FE') === fechaEmision, 'FE'],
    [int(dd, 'MNT') === total, 'MNT'],
    [ted.caf.rut === rutEmisor, 'CAF.RE'],
    [ted.caf.tipoDte === tipoDte, 'CAF.TD'],
    [ted.caf.desde != null && ted.caf.hasta != null && folio >= ted.caf.desde && folio <= ted.caf.hasta, 'CAF.RNG'],
    [ted.algoritmo === 'SHA1withRSA', 'FRMT.algoritmo'],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, name]) => name);
  if (failed.length) throw new DteXmlError('TED_MISMATCH', `TED no coincide con el documento: ${failed.join(', ')}`);

  return { ...parsed, ted };
}

/**
 * @typedef {ReturnType<typeof parseDteXml>} ParsedDte
 */
