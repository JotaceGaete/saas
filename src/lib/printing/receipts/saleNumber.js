// Número interno de la venta (crm_invoices.invoice_number), tal como lo
// asigna el servidor (crm_take_document_number: correlativo por comercio,
// bajo bloqueo, UNIQUE (business_id, invoice_number)). El navegador nunca
// inventa uno: sin número, no se imprime ninguno.
//
// Formato existente de Walinka: NV-0001 (igual que formatInvoiceNumber y
// que el `'NV-' || lpad(n, 4, '0')` de crm_create_pos_sale). Si el valor ya
// viene como texto con su prefijo, se respeta exactamente.

export function formatSaleNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? `NV-${String(value).padStart(4, '0')}` : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) > 0 ? `NV-${text.padStart(4, '0')}` : null;
  return text; // ya trae su forma (p. ej. "NV-0042"): no se toca
}

/** Línea discreta al pie de todo comprobante impreso. null si no hay número. */
export function saleNumberFooterLine(value) {
  const label = formatSaleNumber(value);
  return label ? { type: 'text', text: `Ref. interna ${label}`, align: 'center' } : null;
}
