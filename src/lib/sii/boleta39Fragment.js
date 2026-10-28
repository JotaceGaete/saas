// SII boleta 39: unsigned XML *fragment* for controlled certification fixtures.
// Format reference: SII "Formato Boletas Electrónicas" v4.2 (2025-09-08).
// NOT a DTE: no CAF/TED, XMLDSig, envelope, SII validation or transmission.
// Never mark a sale as fiscally issued based on this output.
import { normalizeChileanRut } from './fiscalDraft';

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export function escapeSiiXml(value, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error('Campo de texto tributario inválido');
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new Error('Caracteres XML prohibidos');
  return value.replace(/[&<>"']/g, char => XML_ESCAPE[char]);
}
function requireInt(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} fuera de rango`);
  return value;
}
function tag(name, value) { return `<${name}>${value}</${name}>`; }
function optional(name, value, maxLength) {
  return value == null || value === '' ? '' : tag(name, escapeSiiXml(value, maxLength));
}
function checkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Fecha calendario inválida');
  return value;
}
const PAY = { cash: 1, debit_card: 2, credit_card: 2, mercado_pago: 2, bank_transfer: 3, check: 4, other: 5 };

/**
 * Build an UNSIGNED, NON-SUBMITTABLE fragment for a straightforward taxable
 * retail sale with gross (VAT-inclusive) prices. No discounts, exemptions,
 * additional taxes, fractional quantities or high-value (135 UF) sales.
 *
 * All values MUST be sourced and authorized server-side before eventual use.
 * Do not allocate real folios for preview.
 */
export function buildUnsignedBoleta39Fragment({ issuer, receiverRut = '66666666-6', folio, issueDate, items, paymentMethod, providerRut }) {
  if (!issuer || !Array.isArray(items) || items.length === 0 || items.length > 1000) throw new Error('Datos de boleta incompletos');
  const rut = normalizeChileanRut(issuer.rut);
  const receiver = normalizeChileanRut(receiverRut);
  requireInt(folio, 'Folio de prueba', 1, 9999999999);
  if (!Object.hasOwn(PAY, paymentMethod)) throw new Error('Medio de pago desconocido');
  const date = checkDate(issueDate);
  if (providerRut == null) throw new Error('Debe determinarse RUT del proveedor del software');
  const provider = normalizeChileanRut(providerRut);
  const detail = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['name', 'quantity', 'unitPrice'].includes(key))) {
      throw new Error('Ítem con propiedades tributarias no soportadas');
    }
    const name = escapeSiiXml(item.name, 80);
    const quantity = requireInt(item.quantity, 'Cantidad', 1, 999999999);
    const price = requireInt(item.unitPrice, 'Precio unitario', 0, 999999999999);
    const lineTotal = requireInt(quantity * price, 'Monto línea', 0, 999999999999);
    return { lineTotal, xml: `<Detalle>${tag('NroLinDet', index + 1)}${tag('NmbItem', name)}${tag('QtyItem', quantity)}${tag('PrcItem', price)}${tag('MontoItem', lineTotal)}</Detalle>` };
  });
  const total = requireInt(detail.reduce((sum, line) => sum + line.lineTotal, 0), 'Monto total', 1, 999999999999);
  // CLP 19% IVA included in gross price; half-up rounding on net amount.
  // Exact SII rounding and reconciliation MUST be checked against official fixtures.
  const net = Math.round(total / 1.19);
  const vat = total - net;
  if (net <= 0 || vat <= 0) throw new Error('Monto demasiado bajo para calcular IVA');
  const header = `<Encabezado><IdDoc>${tag('TipoDTE', 39)}${tag('Folio', folio)}${tag('FchEmis', date)}${tag('IndServicio', 3)}${tag('MedioPago', PAY[paymentMethod])}</IdDoc><Emisor>${tag('RUTEmisor', rut)}${optional('RznSocEmisor', issuer.legalName, 100)}${optional('GiroEmisor', issuer.activity, 80)}${optional('DirOrigen', issuer.address, 70)}${optional('CmnaOrigen', issuer.commune, 20)}</Emisor><Receptor>${tag('RUTRecep', receiver)}</Receptor><Totales>${tag('MntNeto', net)}${tag('IVA', vat)}${tag('MntTotal', total)}</Totales></Encabezado>`;
  // Provider identification belongs to the header schema; do not silently place
  // it in the wrong element until exact XSD order is verified.
  return Object.freeze({ status: 'unsigned_fragment_only', documentType: 39, folio, issuerRut: rut, providerRut: provider, total, net, vat, xmlFragment: header + detail.map(line => line.xml).join('') });
}
