// Documentos SINTÉTICOS para pruebas: misma estructura que los XML aceptados 51105/51106
// (Documento > Encabezado > IdDoc/Emisor/Totales, Detalle, TED), pero sin firma real ni CAF.
// No sirven como boleta: el timbre y la firma son marcadores.

export function syntheticDteXml({ folio, total, rutEmisor = '76123456-7', tipo = 39, neto, iva, withTed = true }) {
  const n = neto ?? Math.round(total / 1.19);
  const i = iva ?? total - n;
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">
  <Documento ID="SINTETICO_F${folio}T${tipo}">
    <Encabezado>
      <IdDoc><TipoDTE>${tipo}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-02</FchEmis><IndServicio>3</IndServicio></IdDoc>
      <Emisor><RUTEmisor>${rutEmisor}</RUTEmisor><RznSocEmisor>EMISOR DE PRUEBA</RznSocEmisor></Emisor>
      <Receptor><RUTRecep>66666666-6</RUTRecep><RznSocRecep>CLIENTE VARIOS</RznSocRecep></Receptor>
      <Totales><MntNeto>${n}</MntNeto><IVA>${i}</IVA><MntTotal>${total}</MntTotal></Totales>
    </Encabezado>
    <Detalle><NroLinDet>1</NroLinDet><NmbItem>Prueba</NmbItem><QtyItem>1</QtyItem><PrcItem>${total}</PrcItem><MontoItem>${total}</MontoItem></Detalle>
    ${withTed ? '<TED version="1.0"><DD>SINTETICO</DD><FRMT algoritmo="SHA1withRSA">NO-ES-UN-TIMBRE</FRMT></TED>' : ''}
  </Documento>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">NO-ES-UNA-FIRMA</Signature>
</DTE>`;
}

export const b64 = (s) => Buffer.from(s, 'latin1').toString('base64');
export const SYNTHETIC_PDF_B64 = b64('%PDF-1.4\n% documento sintetico de prueba\n%%EOF\n');

export function syntheticDocument({ folio, total, rutEmisor }) {
  return { folio, xmlBase64: b64(syntheticDteXml({ folio, total, rutEmisor })), pdfBase64: SYNTHETIC_PDF_B64 };
}
