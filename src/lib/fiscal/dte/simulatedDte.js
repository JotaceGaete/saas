// SIMULACIÓN de una boleta DTE 39 para probar el flujo completo en Preview
// (venta cobrada -> emisión -> impresión con PDF417) SIN DTE Core, SIN SII y
// SIN folios reales.
//
// - Emisor ficticio (RUT 11.111.111-1, "EMISOR SIMULADO"): el papel no se
//   puede confundir con una boleta de Artes SPA.
// - Folios de un rango propio (900001-999999), fuera del CAF de producción
//   (51104-52103).
// - El timbre se firma con una clave de PRUEBA incluida aquí (RSA 512 bits,
//   e = 3, como los CAF del SII). Esa clave no la autorizó el SII; el timbre
//   solo verifica contra sí mismo, igual que el de una boleta real, para que
//   la cadena parseDteXml -> verifyTed -> PDF417 se ejerza completa.
// - Los montos salen de la venta: precios CON IVA incluido (como DTE Core).
//
// Funciona en el navegador (BigInt + crypto.subtle). No hace red.

const TEST_CAF = Object.freeze({
  n: 'e4f9460afd066cd225b1325980d7086742159918e30d90470691b6f3a3067abf05302d11b77a942fc0f9ba0ee2c31132de30c8987fb740f51412aa9fa616ee11',
  d: '98a62eb1fe04488c1920cc3bab3a059a2c0e6610975e602f59b679f7c20451d36b4fd85e4b43be1ae48d39b811064b9ed3f24a9fb2ee01e963e27a788c6d5d4b',
  e: '03',
});

export const SIMULATED_EMISOR = Object.freeze({
  rut: '11111111-1',
  razonSocial: 'EMISOR SIMULADO SIN VALOR TRIBUTARIO',
  giro: 'SIMULACION DE BOLETA ELECTRONICA',
  direccion: 'Sin direccion',
  comuna: 'Simulacion',
});
export const SIMULATED_FOLIO_RANGE = Object.freeze({ desde: 900001, hasta: 999999 });

const SHA1_DIGEST_INFO = [0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14];

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function bytesToBigInt(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}
function bigIntToBytes(n, len) {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}
function modPow(base, exp, mod) {
  let r = 1n; let b = base % mod; let e = exp;
  while (e > 0n) { if (e & 1n) r = (r * b) % mod; b = (b * b) % mod; e >>= 1n; }
  return r;
}
function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

async function signSha1Pkcs1(data, subtle) {
  const k = TEST_CAF.n.length / 2;
  const digest = new Uint8Array(await subtle.digest('SHA-1', data));
  const em = new Uint8Array(k);
  const psLen = k - SHA1_DIGEST_INFO.length - digest.length - 3;
  em[0] = 0; em[1] = 1; em.fill(0xff, 2, 2 + psLen); em[2 + psLen] = 0;
  em.set(SHA1_DIGEST_INFO, 3 + psLen);
  em.set(digest, 3 + psLen + SHA1_DIGEST_INFO.length);
  const s = modPow(bytesToBigInt(em), BigInt(`0x${TEST_CAF.d}`), BigInt(`0x${TEST_CAF.n}`));
  return bytesToB64(bigIntToBytes(s, k));
}

// Texto apto para ISO-8859-1 y para XML.
function xmlText(value, max) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim()
    .replace(/[^\x20-\xff]/g, '?')
    .slice(0, max);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Fecha local de Santiago (AAAA-MM-DD). */
export function santiagoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Líneas de la venta -> líneas del DTE con monto bruto entero.
 * Mismo criterio que fiscal-emit/lib/payload.mjs: precio CON IVA.
 * @param {Array<{ name?: string, description?: string, quantity?: number, unit_price?: number, unitPrice?: number, total?: number, line_total?: number }>} items
 */
export function saleItemsToDteLines(items = []) {
  return items.map((it, i) => {
    const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
    const unit = Math.round(Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0));
    const monto = Math.round(Number(it.line_total ?? it.lineTotal ?? it.total ?? unit * qty));
    return { linea: i + 1, nombre: it.name || it.description || it.product_name || 'Producto', cantidad: qty, precio: unit, monto };
  }).filter((l) => l.monto > 0);
}

/**
 * @param {{ folio: number, lines: ReturnType<typeof saleItemsToDteLines>, fecha?: string, timestamp?: string, subtle?: SubtleCrypto }} p
 * @returns {Promise<string>} XML ISO-8859-1 (como texto)
 */
export async function buildSimulatedDteXml({ folio, lines, fecha = santiagoDate(), timestamp, subtle = globalThis.crypto?.subtle }) {
  if (!Number.isSafeInteger(folio) || folio < SIMULATED_FOLIO_RANGE.desde || folio > SIMULATED_FOLIO_RANGE.hasta) {
    throw Object.assign(new Error('Folio simulado fuera de rango'), { code: 'SIM_FOLIO_RANGE' });
  }
  if (!lines?.length) throw Object.assign(new Error('Venta sin líneas'), { code: 'SIM_NO_LINES' });
  if (!subtle) throw Object.assign(new Error('crypto.subtle no disponible'), { code: 'SIM_NO_CRYPTO' });
  const total = lines.reduce((acc, l) => acc + l.monto, 0);
  const neto = Math.round(total / 1.19);
  const iva = total - neto;
  const ts = timestamp || `${fecha}T${new Date().toTimeString().slice(0, 8)}`;
  const e = SIMULATED_EMISOR;
  const m = bytesToB64(hexToBytes(TEST_CAF.n));
  const exp = bytesToB64(hexToBytes(TEST_CAF.e));

  const dd = `<DD><RE>${e.rut}</RE><TD>39</TD><F>${folio}</F><FE>${fecha}</FE>`
    + `<RR>66666666-6</RR><RSR>CLIENTE VARIOS</RSR><MNT>${total}</MNT><IT1>${xmlText(lines[0].nombre, 40)}</IT1>`
    + `<CAF version="1.0"><DA><RE>${e.rut}</RE><RS>EMISOR SIMULADO</RS><TD>39</TD>`
    + `<RNG><D>${SIMULATED_FOLIO_RANGE.desde}</D><H>${SIMULATED_FOLIO_RANGE.hasta}</H></RNG><FA>2026-01-01</FA>`
    + `<RSAPK><M>${m}</M><E>${exp}</E></RSAPK><IDK>1</IDK></DA><FRMA algoritmo="SHA1withRSA">AAAA</FRMA></CAF>`
    + `<TSTED>${ts}</TSTED></DD>`;
  const frmt = await signSha1Pkcs1(latin1(dd), subtle);

  const detalle = lines.map((l) => `<Detalle><NroLinDet>${l.linea}</NroLinDet><NmbItem>${xmlText(l.nombre, 80)}</NmbItem>`
    + `<QtyItem>${l.cantidad}</QtyItem><PrcItem>${l.precio}</PrcItem><MontoItem>${l.monto}</MontoItem></Detalle>`).join('');

  return '<?xml version="1.0" encoding="ISO-8859-1"?>'
    + '<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">'
    + `<Documento ID="SIM39F${folio}"><Encabezado>`
    + `<IdDoc><TipoDTE>39</TipoDTE><Folio>${folio}</Folio><FchEmis>${fecha}</FchEmis><IndServicio>3</IndServicio></IdDoc>`
    + `<Emisor><RUTEmisor>${e.rut}</RUTEmisor><RznSocEmisor>${e.razonSocial}</RznSocEmisor><GiroEmisor>${e.giro}</GiroEmisor>`
    + `<DirOrigen>${e.direccion}</DirOrigen><CmnaOrigen>${e.comuna}</CmnaOrigen></Emisor>`
    + '<Receptor><RUTRecep>66666666-6</RUTRecep><RznSocRecep>CLIENTE VARIOS</RznSocRecep></Receptor>'
    + `<Totales><MntNeto>${neto}</MntNeto><IVA>${iva}</IVA><MntTotal>${total}</MntTotal></Totales>`
    + `</Encabezado>${detalle}<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>`
    + `<TmstFirma>${ts}</TmstFirma></Documento></DTE>`;
}

/** true si el DTE ya parseado es una simulación (nunca una boleta real). */
export function isSimulatedDte(dte) {
  return dte?.emisor?.rut === SIMULATED_EMISOR.rut
    && dte?.folio >= SIMULATED_FOLIO_RANGE.desde && dte?.folio <= SIMULATED_FOLIO_RANGE.hasta;
}
