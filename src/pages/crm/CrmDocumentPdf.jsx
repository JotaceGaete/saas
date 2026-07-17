import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../utils/formatMoney';
import {
  Document, Page, Text, View, StyleSheet,
  PDFViewer, PDFDownloadLink, Image,
} from '@react-pdf/renderer';
import Icon from 'components/AppIcon';
import { formatQuoteNumber, formatInvoiceNumber, getQuoteDocLabel } from '../../services/crmService';
import { getDocumentItemDetail } from './documentItemPresentation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const fmtMoney = (n, currency) => formatMoney(n, currency);

function fmtPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+56') && digits.length === 12)
    return `+56 ${digits[3]} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  if (digits.startsWith('56') && digits.length === 11)
    return `+56 ${digits[2]} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  if (digits.startsWith('+54') && digits.length >= 12)
    return `+54 9 ${digits.slice(4, 6)} ${digits.slice(6, 10)}-${digits.slice(10)}`;
  return raw;
}

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  navy: '#1B2F4E', navyLight: '#2D4A73', accent: '#2563EB', accentSoft: '#EFF6FF',
  gray100: '#F8FAFC', gray200: '#E2E8F0', gray400: '#94A3B8', gray600: '#475569',
  gray800: '#1E293B', white: '#FFFFFF',
  green: '#15803D', greenSoft: '#DCFCE7', yellow: '#B45309', yellowSoft: '#FEF9C3',
  red: '#B91C1C', redSoft: '#FEE2E2', blue: '#1D4ED8', blueSoft: '#DBEAFE',
};

const STATUS_COLORS = {
  borrador:  { bg: C.gray100,    text: C.gray600 },
  enviado:   { bg: C.blueSoft,   text: C.blue },
  aceptado:  { bg: C.greenSoft,  text: C.green },
  rechazado: { bg: C.redSoft,    text: C.red },
  pendiente: { bg: C.yellowSoft, text: C.yellow },
  pagada:    { bg: C.greenSoft,  text: C.green },
  anulada:   { bg: C.redSoft,    text: C.red },
};
const STATUS_LABELS = {
  borrador: 'BORRADOR', enviado: 'ENVIADO', aceptado: 'ACEPTADO', rechazado: 'RECHAZADO',
  pendiente: 'PENDIENTE', pagada: 'PAGADA', anulada: 'ANULADA',
};
const STATUS_HTML = {
  borrador: 'bg-gray-100 text-gray-600', enviado: 'bg-blue-100 text-blue-700',
  aceptado: 'bg-green-100 text-green-700', rechazado: 'bg-red-100 text-red-700',
  pendiente: 'bg-yellow-100 text-yellow-700', pagada: 'bg-green-100 text-green-700',
  anulada: 'bg-red-100 text-red-700',
};

// ─── Estilos PDF ───────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, color: C.gray800, backgroundColor: C.white, paddingBottom: 70 },
  topBand:     { backgroundColor: C.navy, height: 6 },
  content:     { paddingHorizontal: 44, paddingTop: 28 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo:        { width: 56, height: 56, objectFit: 'contain', marginBottom: 6 },
  bizName:     { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 },
  bizDetail:   { fontSize: 8, color: C.gray600, marginBottom: 1.5 },
  docRight:    { alignItems: 'flex-end' },
  docType:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, textTransform: 'uppercase', letterSpacing: 1.5 },
  docNum:      { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.accent, marginTop: 3 },
  docMeta:     { fontSize: 8, color: C.gray600, marginTop: 3 },
  statusBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  statusText:  { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  divider:     { height: 1, backgroundColor: C.gray200, marginVertical: 18 },
  twoCol:      { flexDirection: 'row', gap: 16, marginBottom: 18 },
  colLeft:     { flex: 3 },
  colRight:    { flex: 2 },
  sectionLabel:{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },
  clientBox:   { backgroundColor: C.accentSoft, borderRadius: 5, padding: 10 },
  clientName:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 },
  clientDetail:{ fontSize: 8, color: C.gray600, marginBottom: 2 },
  condBox:     { backgroundColor: C.gray100, borderRadius: 5, padding: 10 },
  condRow:     { flexDirection: 'row', marginBottom: 4 },
  condKey:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gray800, width: 70 },
  condVal:     { fontSize: 8, color: C.gray600, flex: 1 },
  tableWrap:   { marginBottom: 0 },
  thead:       { flexDirection: 'row', backgroundColor: C.navy, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4 },
  theadCell:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white },
  trow:        { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.gray200, borderBottomStyle: 'solid' },
  trowAlt:     { backgroundColor: C.gray100 },
  tcell:       { fontSize: 8.5, color: C.gray800 },
  tdesc:       { flex: 5 },
  tqty:        { flex: 1, textAlign: 'center' },
  tprice:      { flex: 2.5, textAlign: 'right' },
  tdisc:       { flex: 1.5, textAlign: 'center' },
  tsubtotal:   { flex: 2.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  descSub:     { fontSize: 7.5, color: C.gray400, marginTop: 1 },
  totalsWrap:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totalsBox:   { width: 220 },
  totalsRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: C.gray600 },
  totalsValue: { fontSize: 8.5, color: C.gray800 },
  totalFinal:  { backgroundColor: C.navy, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.white },
  totalValue:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white },
  notesBox:    { backgroundColor: C.gray100, borderRadius: 5, padding: 10, marginTop: 18 },
  notesLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  notesText:   { fontSize: 8.5, color: C.gray600, lineHeight: 1.5 },
  footer:      { position: 'absolute', bottom: 22, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.gray200, borderTopStyle: 'solid', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7.5, color: C.gray400 },
});

// ─── Documento PDF ─────────────────────────────────────────────────────────────
function CrmPdfDocument({ type, document: doc, business, customer, extra = {} }) {
  const isQuote   = type === 'quote';
  const items     = isQuote ? (doc.crm_quote_items || []) : (doc.crm_invoice_items || []);
  const docLabel  = getQuoteDocLabel(business?.documentTitleType);
  const docNum    = isQuote
    ? (doc.quote_number != null ? formatQuoteNumber(doc.quote_number, business?.documentTitleType) : 'Borrador')
    : (doc.invoice_number != null ? formatInvoiceNumber(doc.invoice_number) : 'Borrador');
  const docTitle  = isQuote ? docLabel.title : 'Nota de Venta';
  const currency  = business?.currency || 'CLP';
  const today     = new Date().toLocaleDateString('es-CL');
  const statusCfg = STATUS_COLORS[doc.status] || STATUS_COLORS.borrador;
  const issueStr  = isQuote ? doc.created_at?.slice(0, 10) : doc.issue_date;
  const issueDate = fmtDate(issueStr) || today;
  const validDate = isQuote ? fmtDate(doc.valid_until) : null;
  const dueDate   = !isQuote ? fmtDate(doc.due_date) : null;
  const paymentTerms   = doc.payment_terms   || extra.payment_terms   || null;
  const deliveryDays   = doc.delivery_days   || extra.delivery_days   || null;
  const deliveryMethod = doc.delivery_method || extra.delivery_method || null;
  const commercialNotes= doc.commercial_notes|| extra.commercial_notes|| null;
  const hasConditions  = paymentTerms || deliveryDays || deliveryMethod;
  const hasDiscount    = (doc.discount_amount || 0) > 0;
  const logoUrl        = business?.logoUrl || business?.logo_url || null;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.topBand} />
        <View style={S.content}>
          <View style={S.header}>
            <View style={{ flex: 1 }}>
              {logoUrl && <Image src={logoUrl} style={S.logo} />}
              <Text style={S.bizName}>{business?.name || 'Mi Negocio'}</Text>
              {business?.email    && <Text style={S.bizDetail}>{business.email}</Text>}
              {business?.whatsapp && <Text style={S.bizDetail}>WhatsApp: {fmtPhone(business.whatsapp)}</Text>}
              {business?.address  && <Text style={S.bizDetail}>{business.address}</Text>}
            </View>
            <View style={S.docRight}>
              <Text style={S.docType}>{docTitle}</Text>
              <Text style={S.docNum}>{docNum}</Text>
              <Text style={S.docMeta}>Fecha de emisión: {issueDate}</Text>
              {validDate && <Text style={S.docMeta}>Válido hasta: {validDate}</Text>}
              {dueDate   && <Text style={S.docMeta}>Vence: {dueDate}</Text>}
              {!isQuote && (
                <View style={[S.statusBadge, { backgroundColor: statusCfg.bg }]}>
                  <Text style={[S.statusText, { color: statusCfg.text }]}>
                    {STATUS_LABELS[doc.status] || (doc.status || '').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.twoCol}>
            {customer ? (
              <View style={S.colLeft}>
                <Text style={S.sectionLabel}>Cliente</Text>
                <View style={S.clientBox}>
                  <Text style={S.clientName}>{customer.name || 'Sin nombre'}</Text>
                  {customer.company && customer.company.trim() && customer.company.trim().toLowerCase() !== 'sin empresa' &&
                    <Text style={S.clientDetail}>{customer.company}</Text>}
                  {customer.rut      && <Text style={S.clientDetail}>RUT: {customer.rut}</Text>}
                  {customer.email    && <Text style={S.clientDetail}>{customer.email}</Text>}
                  {customer.phone    && <Text style={S.clientDetail}>Tel: {fmtPhone(customer.phone)}</Text>}
                  {customer.whatsapp && customer.whatsapp !== customer.phone &&
                    <Text style={S.clientDetail}>WhatsApp: {fmtPhone(customer.whatsapp)}</Text>}
                  {customer.address  && <Text style={S.clientDetail}>{customer.address}</Text>}
                </View>
              </View>
            ) : <View style={S.colLeft} />}

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
                  <Text style={[S.tcell, { fontFamily: 'Helvetica-Bold' }]}>{item.name}</Text>
                  {!!getDocumentItemDetail(item) && <Text style={S.descSub}>{getDocumentItemDetail(item)}</Text>}
                </View>
                <Text style={[S.tcell, S.tqty]}>{item.quantity}</Text>
                <Text style={[S.tcell, S.tprice]}>{fmtMoney(item.unit_price, currency)}</Text>
                <Text style={[S.tcell, S.tdisc]}>
                  {item.discount_pct > 0
                    ? (item.discount_type === 'fixed' ? fmtMoney(item.discount_pct, currency) : `${item.discount_pct}%`)
                    : '—'}
                </Text>
                <Text style={[S.tcell, S.tsubtotal]}>{fmtMoney(item.subtotal, currency)}</Text>
              </View>
            ))}
          </View>

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
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>{business?.name || ''} · {docNum}</Text>
          <Text style={S.footerText}>Generado el {today} · Walinka</Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Vista previa HTML (móvil / fallback) ─────────────────────────────────────
function HtmlDocumentPreview({ type, document: doc, business, customer, extra = {} }) {
  const isQuote  = type === 'quote';
  const items    = isQuote ? (doc.crm_quote_items || []) : (doc.crm_invoice_items || []);
  const docLabel  = getQuoteDocLabel(business?.documentTitleType);
  const docNum   = isQuote
    ? (doc.quote_number != null ? formatQuoteNumber(doc.quote_number, business?.documentTitleType) : 'Borrador')
    : (doc.invoice_number != null ? formatInvoiceNumber(doc.invoice_number) : 'Borrador');
  const docTitle = isQuote ? docLabel.title : 'Nota de Venta';
  const currency = business?.currency || 'CLP';
  const today    = new Date().toLocaleDateString('es-CL');
  const issueStr = isQuote ? doc.created_at?.slice(0, 10) : doc.issue_date;
  const issueDate= fmtDate(issueStr) || today;
  const validDate= isQuote ? fmtDate(doc.valid_until) : null;
  const dueDate  = !isQuote ? fmtDate(doc.due_date) : null;
  const paymentTerms   = doc.payment_terms   || extra.payment_terms   || null;
  const deliveryDays   = doc.delivery_days   || extra.delivery_days   || null;
  const deliveryMethod = doc.delivery_method || extra.delivery_method || null;
  const commercialNotes= doc.commercial_notes|| extra.commercial_notes|| null;
  const hasConditions  = paymentTerms || deliveryDays || deliveryMethod;
  const hasDiscount    = (doc.discount_amount || 0) > 0;
  const logoUrl        = business?.logoUrl || business?.logo_url || null;
  const statusCls      = STATUS_HTML[doc.status] || STATUS_HTML.borrador;
  const statusLabel    = STATUS_LABELS[doc.status] || (doc.status || 'BORRADOR').toUpperCase();

  return (
    <div className="bg-white min-h-full">
      {/* Top band */}
      <div className="h-1.5 bg-[#1B2F4E]" />

      <div className="px-5 pt-5 pb-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            {logoUrl && <img src={logoUrl} alt="" className="w-12 h-12 object-contain mb-2 rounded" />}
            <p className="text-lg font-bold text-[#1B2F4E]">{business?.name || 'Mi Negocio'}</p>
            {business?.email    && <p className="text-xs text-gray-500 mt-0.5">{business.email}</p>}
            {business?.whatsapp && <p className="text-xs text-gray-500">WhatsApp: {fmtPhone(business.whatsapp)}</p>}
            {business?.address  && <p className="text-xs text-gray-500">{business.address}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-[#1B2F4E] uppercase tracking-wide">{docTitle}</p>
            <p className="text-sm font-bold text-blue-600 mt-0.5">{docNum}</p>
            <p className="text-xs text-gray-500 mt-1">Emisión: {issueDate}</p>
            {validDate && <p className="text-xs text-gray-500">Válido hasta: {validDate}</p>}
            {dueDate   && <p className="text-xs text-gray-500">Vence: {dueDate}</p>}
            {!isQuote && (
              <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded ${statusCls}`}>
                {statusLabel}
              </span>
            )}
          </div>
        </div>

        <hr className="border-gray-200 mb-5" />

        {/* Client + Conditions */}
        <div className={`flex gap-4 mb-5 ${hasConditions ? 'flex-col sm:flex-row' : ''}`}>
          {customer && (
            <div className="flex-1 sm:flex-[3]">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Cliente</p>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="font-bold text-[#1B2F4E] text-sm">{customer.name || 'Sin nombre'}</p>
                {customer.company && customer.company.trim().toLowerCase() !== 'sin empresa' &&
                  <p className="text-xs text-gray-500 mt-0.5">{customer.company}</p>}
                {customer.rut     && <p className="text-xs text-gray-500 mt-0.5">RUT: {customer.rut}</p>}
                {customer.email   && <p className="text-xs text-gray-500 mt-0.5">{customer.email}</p>}
                {customer.phone   && <p className="text-xs text-gray-500 mt-0.5">Tel: {fmtPhone(customer.phone)}</p>}
                {customer.address && <p className="text-xs text-gray-500 mt-0.5">{customer.address}</p>}
              </div>
            </div>
          )}
          {hasConditions && (
            <div className="flex-1 sm:flex-[2]">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Condiciones</p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                {paymentTerms   && <div className="flex gap-2 text-xs"><span className="font-semibold text-gray-700 w-24 shrink-0">Forma de pago</span><span className="text-gray-500">{paymentTerms}</span></div>}
                {deliveryDays   && <div className="flex gap-2 text-xs"><span className="font-semibold text-gray-700 w-24 shrink-0">Plazo entrega</span><span className="text-gray-500">{deliveryDays}</span></div>}
                {deliveryMethod && <div className="flex gap-2 text-xs"><span className="font-semibold text-gray-700 w-24 shrink-0">Despacho</span><span className="text-gray-500">{deliveryMethod}</span></div>}
              </div>
            </div>
          )}
        </div>

        {/* Items table */}
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="bg-[#1B2F4E] text-white">
                <th className="text-left px-3 py-2 rounded-tl font-semibold">Descripción</th>
                <th className="text-center px-2 py-2 font-semibold w-10">Cant.</th>
                <th className="text-right px-2 py-2 font-semibold w-24">P. Unit.</th>
                <th className="text-center px-2 py-2 font-semibold w-12">Desc.</th>
                <th className="text-right px-3 py-2 rounded-tr font-semibold w-24">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    {!!getDocumentItemDetail(item) && <p className="text-[10px] text-gray-400 mt-0.5">{getDocumentItemDetail(item)}</p>}
                  </td>
                  <td className="text-center px-2 py-2 border-b border-gray-100 text-gray-700">{item.quantity}</td>
                  <td className="text-right px-2 py-2 border-b border-gray-100 text-gray-700">{fmtMoney(item.unit_price, currency)}</td>
                  <td className="text-center px-2 py-2 border-b border-gray-100 text-gray-500">
                    {item.discount_pct > 0
                      ? (item.discount_type === 'fixed' ? fmtMoney(item.discount_pct, currency) : `${item.discount_pct}%`)
                      : '—'}
                  </td>
                  <td className="text-right px-3 py-2 border-b border-gray-100 font-semibold text-gray-900">{fmtMoney(item.subtotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-5">
          <div className="w-56">
            {hasDiscount && (
              <>
                <div className="flex justify-between text-xs py-1 text-gray-500">
                  <span>Subtotal bruto</span>
                  <span>{fmtMoney((doc.total || 0) + (doc.discount_amount || 0), currency)}</span>
                </div>
                <div className="flex justify-between text-xs py-1 text-green-600">
                  <span>Descuentos</span>
                  <span>-{fmtMoney(doc.discount_amount, currency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center bg-[#1B2F4E] text-white rounded-xl px-4 py-3 mt-2">
              <span className="font-bold text-sm">TOTAL</span>
              <span className="font-bold text-base">{fmtMoney(doc.total, currency)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(doc.notes || commercialNotes) && (
          <div className="bg-gray-50 rounded-xl p-4 mb-5">
            {doc.notes && (
              <>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Observaciones</p>
                <p className="text-xs text-gray-600 leading-relaxed">{doc.notes}</p>
              </>
            )}
            {commercialNotes && (
              <div className={doc.notes ? 'mt-3' : ''}>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Notas adicionales</p>
                <p className="text-xs text-gray-600 leading-relaxed">{commercialNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 pt-3 flex justify-between text-[10px] text-gray-400">
          <span>{business?.name || ''} · {docNum}</span>
          <span>Generado el {today} · Walinka</span>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper principal ─────────────────────────────────────────────────────────
export default function CrmDocumentPdf({ type, document: doc, business, customer, extra, onClose }) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const docLabelForFilename = getQuoteDocLabel(business?.documentTitleType);
  const filename = type === 'quote'
    ? `${docLabelForFilename.singular}-${doc?.quote_number != null ? formatQuoteNumber(doc.quote_number, business?.documentTitleType) : 'borrador'}.pdf`
    : `nota-venta-${doc?.invoice_number != null ? formatInvoiceNumber(doc.invoice_number) : 'borrador'}.pdf`;

  const pdfEl = <CrmPdfDocument type={type} document={doc} business={business} customer={customer} extra={extra} />;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            aria-label="Cerrar"
          >
            <Icon name="X" size={18} />
          </button>
          <div>
            <p className="font-semibold text-gray-800 text-sm leading-tight">{filename}</p>
            {isMobile && <p className="text-[10px] text-gray-400 leading-tight">Vista previa — PDF disponible en escritorio</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium"
          >
            <Icon name="ArrowLeft" size={14} />
            Volver a editar
          </button>
        <PDFDownloadLink
          document={pdfEl}
          fileName={filename}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          {({ loading }) => loading
            ? <><Icon name="Loader2" size={15} className="animate-spin" />Preparando…</>
            : <><Icon name="Download" size={15} />Descargar PDF</>
          }
        </PDFDownloadLink>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isMobile ? (
          <HtmlDocumentPreview
            type={type}
            document={doc}
            business={business}
            customer={customer}
            extra={extra}
          />
        ) : (
          <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
            {pdfEl}
          </PDFViewer>
        )}
      </div>
    </div>
  );
}
