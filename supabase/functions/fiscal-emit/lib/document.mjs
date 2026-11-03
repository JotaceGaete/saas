// Validación del documento que devuelve el proveedor. Compartida por emisión y reconciliación.
// Un documento solo es válido con folio entero positivo, XML y PDF no vacíos.

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isStrictBase64(v) {
  return typeof v === 'string' && v.length > 0 && B64.test(v);
}

// Base64 estricto: un documento con base64 mal formado no es un documento completo. Si llegara a
// la base, Postgres lo rechazaría (22023) y el recibo se perdería; por eso se valida antes.
export function validDocument(doc) {
  return Boolean(
    doc &&
      Number.isSafeInteger(doc.folio) &&
      doc.folio > 0 &&
      isStrictBase64(doc.xmlBase64) &&
      isStrictBase64(doc.pdfBase64),
  );
}
