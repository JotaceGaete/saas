// Boleta DTE 39 SINTÉTICA para pruebas: datos ficticios y un CAF de prueba
// generado en el momento (clave RSA de 512 bits, e=3, como los CAF del SII).
// No contiene datos de ningún contribuyente real ni firmas reales.
import { generateKeyPairSync, createSign } from 'node:crypto';

let cachedKeys = null;
function cafKeys() {
  if (!cachedKeys) {
    cachedKeys = generateKeyPairSync('rsa', { modulusLength: 512, publicExponent: 3 });
  }
  return cachedKeys;
}

function b64(bufferLike) {
  return Buffer.from(bufferLike).toString('base64');
}

export function buildSyntheticDteXml({
  folio = 1201,
  fecha = '2026-11-01',
  total = 1190,
  neto = 1000,
  iva = 190,
  itemName = 'Cafe con leche',
  razonSocial = 'Comercial Ñandú SpA',
  rangoDesde = 1001,
  rangoHasta = 2000,
  indent = true,
} = {}) {
  const { publicKey, privateKey } = cafKeys();
  const jwk = publicKey.export({ format: 'jwk' });
  const fromB64url = (s) => b64(Buffer.from(s, 'base64url'));
  const nl = indent ? '\n' : '';
  const sp = (n) => (indent ? ' '.repeat(n) : '');

  const ddInner = [
    `<RE>11111111-1</RE>`, `<TD>39</TD>`, `<F>${folio}</F>`, `<FE>${fecha}</FE>`,
    `<RR>66666666-6</RR>`, `<RSR>CLIENTE VARIOS</RSR>`, `<MNT>${total}</MNT>`, `<IT1>${itemName}</IT1>`,
    `<CAF version="1.0"><DA><RE>11111111-1</RE><RS>COMERCIAL ÑANDU SPA</RS><TD>39</TD>`
      + `<RNG><D>${rangoDesde}</D><H>${rangoHasta}</H></RNG><FA>2026-10-01</FA>`
      + `<RSAPK><M>${fromB64url(jwk.n)}</M><E>${fromB64url(jwk.e)}</E></RSAPK><IDK>100</IDK></DA>`
      + `<FRMA algoritmo="SHA1withRSA">AAAA</FRMA></CAF>`,
    `<TSTED>${fecha}T10:00:00</TSTED>`,
  ];
  const ddFlat = `<DD>${ddInner.join('')}</DD>`;
  const signer = createSign('RSA-SHA1');
  signer.update(Buffer.from(ddFlat, 'latin1'));
  const frmt = signer.sign(privateKey).toString('base64');

  const ddPrinted = indent ? `<DD>${nl}${ddInner.map((x) => sp(10) + x).join(nl)}${nl}${sp(8)}</DD>` : ddFlat;

  const xml = [
    '<?xml version="1.0" encoding="ISO-8859-1"?>',
    '<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">',
    `${sp(2)}<Documento ID="T39F${folio}">`,
    `${sp(4)}<Encabezado>`,
    `${sp(6)}<IdDoc><TipoDTE>39</TipoDTE><Folio>${folio}</Folio><FchEmis>${fecha}</FchEmis><IndServicio>3</IndServicio></IdDoc>`,
    `${sp(6)}<Emisor><RUTEmisor>11111111-1</RUTEmisor><RznSocEmisor>${razonSocial}</RznSocEmisor>`
      + `<GiroEmisor>VENTA AL POR MENOR</GiroEmisor><DirOrigen>Calle Falsa 123</DirOrigen>`
      + `<CmnaOrigen>Coronel</CmnaOrigen><CiudadOrigen>Coronel</CiudadOrigen></Emisor>`,
    `${sp(6)}<Receptor><RUTRecep>66666666-6</RUTRecep><RznSocRecep>CLIENTE VARIOS</RznSocRecep></Receptor>`,
    `${sp(6)}<Totales><MntNeto>${neto}</MntNeto><IVA>${iva}</IVA><MntTotal>${total}</MntTotal></Totales>`,
    `${sp(4)}</Encabezado>`,
    `${sp(4)}<Detalle><NroLinDet>1</NroLinDet><NmbItem>${itemName}</NmbItem><QtyItem>1</QtyItem>`
      + `<PrcItem>${total}</PrcItem><MontoItem>${total}</MontoItem></Detalle>`,
    `${sp(4)}<TED version="1.0">${nl}${sp(6)}${ddPrinted}${nl}${sp(6)}<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT>${nl}${sp(4)}</TED>`,
    `${sp(4)}<TmstFirma>${fecha}T10:00:00</TmstFirma>`,
    `${sp(2)}</Documento>`,
    '</DTE>',
  ].join(indent ? '\r\n' : '');
  return xml;
}

export function latin1Bytes(text) {
  return Uint8Array.from(Buffer.from(text, 'latin1'));
}
