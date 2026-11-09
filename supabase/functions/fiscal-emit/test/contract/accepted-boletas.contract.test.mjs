// Contrato de precios y campos contra boletas REALES aceptadas por el SII (51105, 51106).
// Sin red. Si FISCAL_ACCEPTED_XML_DIR apunta a una carpeta con los XML originales (nombres
// <folio>.xml o cualquier nombre), también comprueba que el fixture coincide con esos XML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildBoletaPayload, expectedTotals } from '../../lib/payload.mjs';
import { inspectDteXml, documentProblem } from '../../lib/providers/siisolutions-http.mjs';

const FIX = JSON.parse(readFileSync(new URL('./fixtures/accepted-boletas.json', import.meta.url), 'utf8'));

for (const b of FIX.boletas) {
  test(`boleta ${b.folio}: el payload de Walinka para la misma venta reproduce PrcItem, MontoItem y Totales`, () => {
    const lines = b.detalle.map((d) => ({
      name: d.nmbItem, sku: d.vlrCodigo, unitPrice: d.prcItem, quantity: d.qtyItem, discountPct: 0, category: 'IVA_AFECTO_19',
    }));
    const p = buildBoletaPayload({
      operationId: `WLK-contract-${b.folio}`, rutOperador: b.rutEmisor, lines, montoPago: b.totales.mntTotal, medioPago: 'EF',
    });
    p.detalles.forEach((d, i) => {
      assert.equal(d.precio, b.detalle[i].prcItem, 'precio enviado = PrcItem del XML aceptado (bruto)');
      assert.equal(d.precioSubtotal, b.detalle[i].montoItem);
      assert.equal(d.cantidad, b.detalle[i].qtyItem);
    });
    const t = expectedTotals(p);
    assert.equal(t.neto, b.totales.mntNeto);
    assert.equal(t.iva, b.totales.iva);
    assert.equal(t.total, b.totales.mntTotal);
    assert.equal(p.montoPago, String(b.totales.mntTotal));
    assert.equal(`${p.cliente.rut}-${p.cliente.digito}`, b.rutRecep);
  });
}

test('si se hubiera enviado precio NETO (versión anterior de PR #108), la 51106 no cuadraría', () => {
  const b = FIX.boletas.find((x) => x.folio === 51106);
  const netPrice = Math.round(b.detalle[0].prcItem / 1.19); // 84
  assert.notEqual(netPrice, b.detalle[0].prcItem);
  // El proveedor trata precio como bruto: 84 bruto -> MntTotal 84, no 100.
  assert.notEqual(netPrice * b.detalle[0].qtyItem, b.totales.mntTotal);
});

test('el cuerpo de Walinka usa exactamente los campos de la solicitud que produjo la 51106', () => {
  const p = buildBoletaPayload({
    operationId: 'WLK-x', rutOperador: '77804207-K', medioPago: 'EF', montoPago: 100,
    lines: [{ name: 'prueba', unitPrice: 100, quantity: 1, category: 'IVA_AFECTO_19' }],
  });
  assert.deepEqual(Object.keys(p).sort(), FIX.solicitudAceptada51106.campos);
  assert.deepEqual(Object.keys(p.detalles[0]).sort(), FIX.solicitudAceptada51106.camposDetalle);
});

const dir = process.env.FISCAL_ACCEPTED_XML_DIR;
test('XML originales (opcional): coinciden con el fixture y pasan la validación del adaptador', { skip: !dir && 'FISCAL_ACCEPTED_XML_DIR no definido' }, () => {
  const files = readdirSync(dir).map((f) => join(dir, f));
  let checked = 0;
  for (const f of files) {
    const bytes = readFileSync(f);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const b = FIX.boletas.find((x) => x.sha256 === sha);
    if (!b) continue;
    const xmlBase64 = bytes.toString('base64');
    const info = inspectDteXml(xmlBase64);
    assert.equal(info.folio, b.folio);
    assert.equal(info.tipoDte, 39);
    assert.equal(info.rutEmisor, b.rutEmisor);
    assert.equal(info.mntNeto, b.totales.mntNeto);
    assert.equal(info.iva, b.totales.iva);
    assert.equal(info.mntTotal, b.totales.mntTotal);
    assert.equal(info.hasTed, true);
    assert.equal(info.hasSignature, true);
    const pdfBase64 = Buffer.from('%PDF-1.4\n').toString('base64');
    assert.equal(documentProblem({ folio: b.folio, xmlBase64, pdfBase64 }, { total: b.totales.mntTotal, rutEmisor: b.rutEmisor }), null);
    checked += 1;
  }
  assert.equal(checked, FIX.boletas.length, 'deben encontrarse los dos XML originales');
});
