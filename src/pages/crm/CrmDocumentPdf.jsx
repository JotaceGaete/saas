import React from 'react';
import {
  Document, Page, Text, View, StyleSheet,
  PDFViewer, PDFDownloadLink, Image,
} from '@react-pdf/renderer';
import Icon from 'components/AppIcon';
import { formatQuoteNumber, formatInvoiceNumber } from '../../services/crmService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parsea 'YYYY-MM-DD' como fecha local para evitar off-by-one por timezone */
function parseLocalDate(str) {
  if (!str) return null;
  const s = typeof str === 'string' ? str.slice(0, 10) : str;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(str) {
  const d = parseLocalDate(str);
  if (!d || isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n || 0);
}

/** Formatea teléfono: +56993443682 → +56 9 9344 3682 */
function fmtPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+56') && digits.length === 12) {
    // +56 9 XXXX XXXX
    return `+56 ${digits[3]} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  if (digits.startsWith('56') && digits.length === 11) {
    return `+56 ${digits[2]} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  if (digits.startsWith('+54') && digits.length >= 12) {
    // Argentina +54 9 XX XXXX XXXX
    return `+54 9 ${digits.slice(4, 6)} ${digits.slice(6, 10)}-${digits.slice(10)}`;
  }
  return raw;
}

// ─── Paleta de colores ─────────────────────────────────────────────────────────
const C = {
  navy:       '#1B2F4E',
  navyLight:  '#2D4A73',
  accent:     '#2563EB',
  accentSoft: '#EFF6FF',
  gray100:    '#F8FAFC',
  gray200:    '#E2E8F0',
  gray400:    '#94A3B8',
  gray600:    '#475569',
  gray800:    '#1E293B',
  white:      '#FFFFFF',
  green:      '#15803D',
  greenSoft:  '#DCFCE7',
  yellow:     '#B45309',
  yellowSoft: '#FEF9C3',
  red:        '#B91C1C',
  redSoft:    '#FEE2E2',
  blue:       '#1D4ED8',
  blueSoft:   '#DBEAFE',
};

const STATUS_COLORS = {
  borrador:  { bg: C.gray100,   text: C.gray600  },
  enviado:   { bg: C.blueSoft,  text: C.blue     },
  aceptado:  { bg: C.greenSoft, text: C.green    },
  rechazado: { bg: C.redSoft,   text: C.red      },
  pendiente: { bg: C.yellowSoft,text: C.yellow   },
  pagada:    { bg: C.greenSoft, text: C.green    },
  anulada:   { bg: C.redSoft,   text: C.red      },
};
const STATUS_LABELS = {
  borrador: 'BORRADOR', enviado: 'ENVIADO', aceptado: 'ACEPTADO', rechazado: 'RECHAZADO',
  pendiente: 'PENDIENTE', pagada: 'PAGADA', anulada: 'ANULADA',
};

// ─── Estilos ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 9, color: C.gray800, backgroundColor: C.white, paddingBottom: 70 },

  // Banda superior color
  topBand:      { backgroundColor: C.navy, height: 6 },

  content:      { paddingHorizontal: 44, paddingTop: 28 },

  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo:         { width: 56, height: 56, objectFit: 'contain', marginBottom: 6 },
  bizName:      { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 },
  bizDetail:    { fontSize: 8, color: C.gray600, marginBottom: 1.5 },

  // Doc info (derecha)
  docRight:     { alignItems: 'flex-end' },
  docType:      { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, textTransform: 'uppercase', letterSpacing: 1.5 },
  docNum:       { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.accent, marginTop: 3 },
  docMeta:      { fontSize: 8, color: C.gray600, marginTop: 3 },
  statusBadge:  { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  statusText:   { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Divider
  divider:      { height: 1, backgroundColor: C.gray200, marginVertical: 18 },
  accentLine:   { height: 2, backgroundColor: C.accent, marginBottom: 18, width: 40 },

  // Bloque cliente + condiciones (2 columnas)
  twoCol:       { flexDirection: 'row', gap: 16, marginBottom: 18 },
  colLeft:      { flex: 3 },
  colRight:     { flex: 2 },

  // Sección general
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },
  clientBox:    { backgroundColor: C.accentSoft, borderRadius: 5, padding: 10 },
  clientName:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 },
  clientDetail: { fontSize: 8, color: C.gray600, marginBottom: 2 },

  condBox:      { backgroundColor: C.gray100, borderRadius: 5, padding: 10 },
  condRow:      { flexDirection: 'row', marginBottom: 4 },
  condKey:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gray800, width: 70 },
  condVal:      { fontSize: 8, color: C.gray600, flex: 1 },

  // Tabla
  tableWrap:    { marginBottom: 0 },
  thead:        { flexDirection: 'row', backgroundColor: C.navy, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4 },
  theadCell:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white },
  trow:         { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.gray200, borderBottomStyle: 'solid' },
  trowAlt:      { backgroundColor: C.gray100 },
  tcell:        { fontSize: 8.5, color: C.gray800 },
  tdesc:        { flex: 5 },
  tqty:         { flex: 1, textAlign: 'center' },
  tprice:       { flex: 2.5, textAlign: 'right' },
  tdisc:        { flex: 1.5, textAlign: 'center' },
  tsubtotal:    { flex: 2.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  descSub:      { fontSize: 7.5, color: C.gray400, marginTop: 1 },

  // Totales
  totalsWrap:   { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totalsBox:    { width: 220 },
  totalsRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel:  { fontSize: 8.5, color: C.gray600 },
  totalsValue:  { fontSize: 8.5, color: C.gray800 },
  totalFinal:   { backgroundColor: C.navy, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.white },
  totalValue:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white },

  // Notas / condiciones
  notesBox:     { backgroundColor: C.gray100, borderRadius: 5, padding: 10, marginTop: 18 },
  notesLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  notesText:    { fontSize: 8.5, color: C.gray600, lineHeight: 1.5 },

  // Disclaimer
  disclaimer:   { marginTop: 18, backgroundColor: C.yellowSoft, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#EAB308', borderLeftStyle: 'solid', padding: '6 10' },
  disclaimerTx: { fontSize: 7.5, color: C.yellow },

  // Footer
  footer:       { position: 'absolute', bottom: 22, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.gray200, borderTopStyle: 'solid', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:   { fontSize: 7.5, color: C.gray400 },
});

// ─── Documento PDF ─────────────────────────────────────────────────────────────
function CrmPdfDocument({ type, document: doc, business, customer, extra = {} }) {
  const isQuote = type === 'quote';
  const items   = isQuote ? (doc.crm_quote_items || []) : (doc.crm_invoice_items || []);
  const docNum  = isQuote ? formatQuoteNumber(doc.quote_number) : formatInvoiceNumber(doc.invoice_number);
  const docTitle = isQuote ? 'Presupuesto' : 'Factura Interna';
  const currency  = business?.currency || 'CLP';
  const today     = new Date().toLocaleDateString('es-CL');
  const statusCfg = STATUS_COLORS[doc.status] || STATUS_COLORS.borrador;

  // Fecha de emisión: para quotes usar created_at, para invoices usar issue_date
  const issueStr  = isQuote ? doc.created_at?.slice(0, 10) : doc.issue_date;
  const issueDate = fmtDate(issueStr) || today;
  const validDate = isQuote ? fmtDate(doc.valid_until) : null;
  const dueDate   = !isQuote ? fmtDate(doc.due_date) : null;

  // Campos comerciales
  const paymentTerms    = doc.payment_terms    || extra.payment_terms    || null;
  const deliveryDays    = doc.delivery_days    || extra.delivery_days    || null;
  const deliveryMethod  = doc.delivery_method  || extra.delivery_method  || null;
  const commercialNotes = doc.commercial_notes || extra.commercial_notes || null;

  const hasConditions = paymentTerms || deliveryDays || deliveryMethod;
  const hasDiscount   = (doc.discount_amount || 0) > 0;
  const logoUrl       = business?.logoUrl || business?.logo_url || null;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Banda de color superior */}
        <View style={S.topBand} />

        <View style={S.content}>
          {/* ── ENCABEZADO ── */}
          <View style={S.header}>
            {/* Izquierda: logo + datos del negocio */}
            <View style={{ flex: 1 }}>
              {logoUrl && (
                <Image src={logoUrl} style={S.logo} />
              )}
              <Text style={S.bizName}>{business?.name || 'Mi Negocio'}</Text>
              {business?.email    && <Text style={S.bizDetail}>{business.email}</Text>}
              {business?.whatsapp && <Text style={S.bizDetail}>WhatsApp: {fmtPhone(business.whatsapp)}</Text>}
              {business?.address  && <Text style={S.bizDetail}>{business.address}</Text>}
            </View>

            {/* Derecha: tipo + número + fechas + estado */}
            <View style={S.docRight}>
              <Text style={S.docType}>{docTitle}</Text>
              <Text style={S.docNum}>{docNum}</Text>
              <Text style={S.docMeta}>Fecha de emisión: {issueDate}</Text>
              {validDate && <Text style={[S.docMeta, { color: validDate < today ? '#B91C1C' : S.docMeta.color }]}>Válido hasta: {validDate}</Text>}
              {dueDate   && <Text style={S.docMeta}>Vence: {dueDate}</Text>}
              <View style={[S.statusBadge, { backgroundColor: statusCfg.bg }]}>
                <Text style={[S.statusText, { color: statusCfg.text }]}>
                  {STATUS_LABELS[doc.status] || doc.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={S.divider} />

          {/* ── CLIENTE + CONDICIONES ── */}
          <View style={S.twoCol}>
            {/* Cliente */}
            {customer ? (
              <View style={S.colLeft}>
                <Text style={S.sectionLabel}>Cliente</Text>
                <View style={S.clientBox}>
                  <Text style={S.clientName}>{customer.name || 'Sin nombre'}</Text>
                  {customer.company   && <Text style={S.clientDetail}>{customer.company}</Text>}
                  {customer.rut       && <Text style={S.clientDetail}>RUT: {customer.rut}</Text>}
                  {customer.email     && <Text style={S.clientDetail}>{customer.email}</Text>}
                  {customer.phone     && <Text style={S.clientDetail}>Tel: {fmtPhone(customer.phone)}</Text>}
                  {customer.whatsapp  && customer.whatsapp !== customer.phone && (
                    <Text style={S.clientDetail}>WhatsApp: {fmtPhone(customer.whatsapp)}</Text>
                  )}
                  {customer.address   && <Text style={S.clientDetail}>{customer.address}</Text>}
                </View>
              </View>
            ) : (
              <View style={S.colLeft} />
            )}

            {/* Condiciones comerciales */}
            {hasConditions && (
              <View style={S.colRight}>
                <Text style={S.sectionLabel}>Condiciones</Text>
                <View style={S.condBox}>
                  {paymentTerms   && <View style={S.condRow}><Text style={S.condKey}>Forma de pago</Text><Text style={S.condVal}>{paymentTerms}</Text></View>}
                  {deliveryDays   && <View style={S.condRow}><Text style={S.condKey}>Plazo entrega</Text><Text style={S.condVal}>{deliveryDays}</Text></View>}
                  {deliveryMethod && <View style={S.condRow}><Text style={S.condKey}>Despacho</Text><Text style={S.condVal}>{deliveryMethod}</Text></View>}
                </View>
              </View>
            )}
          </View>

          {/* ── TABLA DE ÍTEMS ── */}
          <View style={S.tableWrap}>
            <View style={S.thead}>
              <Text style={[S.theadCell, S.tdesc]}>Descripción</Text>
              <Text style={[S.theadCell, S.tqty]}>Cant.</Text>
              <Text style={[S.theadCell, S.tprice]}>P. Unitario</Text>
              <Text style={[S.theadCell, S.tdisc]}>Desc.</Text>
              <Text style={[S.theadCell, S.tsubtotal]}>Subtotal</Text>
            </View>
            {items.map((item, idx) => (
              <View key={idx} style={[S.trow, idx % 2 === 1 ? S.trowAlt : {}]} wrap={false}>
                <View style={S.tdesc}>
                  <Text style={S.tcell}>{item.name}</Text>
                  {!!item.description && <Text style={S.descSub}>{item.description}</Text>}
                </View>
                <Text style={[S.tcell, S.tqty]}>{item.quantity}</Text>
                <Text style={[S.tcell, S.tprice]}>{fmtMoney(item.unit_price, currency)}</Text>
                <Text style={[S.tcell, S.tdisc]}>{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</Text>
                <Text style={[S.tcell, S.tsubtotal]}>{fmtMoney(item.subtotal, currency)}</Text>
              </View>
            ))}
          </View>

          {/* ── TOTALES ── */}
          <View style={S.totalsWrap}>
            <View style={S.totalsBox}>
              {hasDiscount && (
                <>
                  <View style={S.totalsRow}>
                    <Text style={S.totalsLabel}>Subtotal bruto</Text>
                    <Text style={S.totalsValue}>{fmtMoney((doc.total || 0) + (doc.discount_amount || 0), currency)}</Text>
                  </View>
                  <View style={S.totalsRow}>
                    <Text style={S.totalsLabel}>Descuentos</Text>
                    <Text style={[S.totalsValue, { color: '#15803D' }]}>-{fmtMoney(doc.discount_amount, currency)}</Text>
                  </View>
                </>
              )}
              <View style={S.totalFinal}>
                <Text style={S.totalLabel}>TOTAL</Text>
                <Text style={S.totalValue}>{fmtMoney(doc.total, currency)}</Text>
              </View>
            </View>
          </View>

          {/* ── NOTAS / OBSERVACIONES ── */}
          {(doc.notes || commercialNotes) && (
            <View style={S.notesBox}>
              {doc.notes && (
                <>
                  <Text style={S.notesLabel}>Observaciones</Text>
                  <Text style={S.notesText}>{doc.notes}</Text>
                </>
              )}
              {commercialNotes && (
                <>
                  {doc.notes && <View style={{ height: 6 }} />}
                  <Text style={S.notesLabel}>Notas adicionales</Text>
                  <Text style={S.notesText}>{commercialNotes}</Text>
                </>
              )}
            </View>
          )}

          {/* ── DISCLAIMER ── */}
          <View style={S.disclaimer}>
            <Text style={S.disclaimerTx}>
              Este documento es un comprobante interno y no tiene valor tributario. No es un DTE ni reemplaza a una factura o boleta oficial.
            </Text>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{business?.name || ''} · {docNum}</Text>
          <Text style={S.footerText}>Generado el {today} · Walinka</Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Wrapper con visor ─────────────────────────────────────────────────────────
export default function CrmDocumentPdf({ type, document: doc, business, customer, extra, onClose }) {
  const filename = type === 'quote'
    ? `presupuesto-${formatQuoteNumber(doc?.quote_number)}.pdf`
    : `factura-${formatInvoiceNumber(doc?.invoice_number)}.pdf`;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
            <Icon name="X" size={18} />
          </button>
          <span className="font-semibold text-gray-800 text-sm">{filename}</span>
        </div>
        <PDFDownloadLink
          document={<CrmPdfDocument type={type} document={doc} business={business} customer={customer} extra={extra} />}
          fileName={filename}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          {({ loading }) => loading
            ? <><Icon name="Loader2" size={15} className="animate-spin" />Preparando…</>
            : <><Icon name="Download" size={15} />Descargar PDF</>
          }
        </PDFDownloadLink>
      </div>
      <div className="flex-1 overflow-hidden">
        <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
          <CrmPdfDocument type={type} document={doc} business={business} customer={customer} extra={extra} />
        </PDFViewer>
      </div>
    </div>
  );
}
