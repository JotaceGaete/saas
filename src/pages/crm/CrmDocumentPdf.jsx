import React, { useState } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFViewer,
  PDFDownloadLink,
} from '@react-pdf/renderer';
import Icon from 'components/AppIcon';
import { formatQuoteNumber, formatInvoiceNumber } from '../../services/crmService';

// ─── Estilos del PDF ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a2e', backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, alignItems: 'flex-start' },
  businessName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', marginBottom: 4 },
  businessDetail: { fontSize: 9, color: '#555', marginBottom: 2 },
  docTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', textAlign: 'right' },
  docNumber: { fontSize: 12, color: '#555', textAlign: 'right', marginBottom: 2 },
  docMeta: { fontSize: 9, color: '#555', textAlign: 'right', marginTop: 2 },
  statusBadge: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 6 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 16 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  clientBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 16 },
  clientName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', marginBottom: 3 },
  clientDetail: { fontSize: 9, color: '#555', marginBottom: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a5f', padding: '6 8', borderRadius: '4 4 0 0' },
  tableHeaderCell: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tableRow: { flexDirection: 'row', padding: '6 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  tableCell: { fontSize: 9, color: '#374151' },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: 'center' },
  colPrice: { flex: 2, textAlign: 'right' },
  colDisc: { flex: 1, textAlign: 'center' },
  colSubtotal: { flex: 2, textAlign: 'right' },
  totalsBox: { alignItems: 'flex-end', marginTop: 16 },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4, gap: 16 },
  totalsLabel: { fontSize: 10, color: '#555', width: 100, textAlign: 'right' },
  totalsValue: { fontSize: 10, color: '#1a1a2e', width: 90, textAlign: 'right' },
  totalFinalLabel: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', width: 100, textAlign: 'right' },
  totalFinalValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', width: 90, textAlign: 'right' },
  notes: { marginTop: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 6 },
  notesText: { fontSize: 9, color: '#555', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#94a3b8' },
  warningBox: { marginTop: 20, padding: 10, backgroundColor: '#fef9c3', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#eab308', borderLeftStyle: 'solid' },
  warningText: { fontSize: 8, color: '#713f12' },
});

const STATUS_BG = {
  borrador: '#f1f5f9', enviado: '#dbeafe', aceptado: '#dcfce7', rechazado: '#fee2e2',
  pendiente: '#fef9c3', pagada: '#dcfce7', anulada: '#fee2e2',
};
const STATUS_TEXT = {
  borrador: '#475569', enviado: '#1d4ed8', aceptado: '#15803d', rechazado: '#b91c1c',
  pendiente: '#854d0e', pagada: '#15803d', anulada: '#b91c1c',
};
const STATUS_LABELS = { borrador: 'BORRADOR', enviado: 'ENVIADO', aceptado: 'ACEPTADO', rechazado: 'RECHAZADO', pendiente: 'PENDIENTE', pagada: 'PAGADA', anulada: 'ANULADA' };

function fmt(n, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
}

function CrmPdfDocument({ type, document: doc, business, customer }) {
  const isQuote = type === 'quote';
  const items = isQuote ? (doc.crm_quote_items || []) : (doc.crm_invoice_items || []);
  const docNum = isQuote ? formatQuoteNumber(doc.quote_number) : formatInvoiceNumber(doc.invoice_number);
  const docTitle = isQuote ? 'PRESUPUESTO' : 'FACTURA INTERNA';
  const currency = business?.currency || 'CLP';
  const today = new Date().toLocaleDateString('es-CL');
  const issueDate = isQuote
    ? new Date(doc.created_at).toLocaleDateString('es-CL')
    : new Date(doc.issue_date).toLocaleDateString('es-CL');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{business?.name || 'Mi Negocio'}</Text>
            {business?.email && <Text style={styles.businessDetail}>{business.email}</Text>}
            {business?.whatsapp && <Text style={styles.businessDetail}>WhatsApp: {business.whatsapp}</Text>}
            {business?.address && <Text style={styles.businessDetail}>{business.address}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>{docTitle}</Text>
            <Text style={styles.docNumber}>{docNum}</Text>
            <Text style={styles.docMeta}>Fecha: {issueDate}</Text>
            {isQuote && doc.valid_until && <Text style={styles.docMeta}>Válido hasta: {new Date(doc.valid_until).toLocaleDateString('es-CL')}</Text>}
            {!isQuote && doc.due_date && <Text style={styles.docMeta}>Vence: {new Date(doc.due_date).toLocaleDateString('es-CL')}</Text>}
            <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[doc.status] }]}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: STATUS_TEXT[doc.status] }}>{STATUS_LABELS[doc.status] || doc.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Cliente */}
        {customer && (
          <View style={styles.clientBox}>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <Text style={styles.clientName}>{customer.name || 'Sin nombre'}</Text>
            {customer.company && <Text style={styles.clientDetail}>{customer.company}</Text>}
            {customer.rut && <Text style={styles.clientDetail}>RUT: {customer.rut}</Text>}
            {customer.email && <Text style={styles.clientDetail}>{customer.email}</Text>}
            {customer.phone && <Text style={styles.clientDetail}>Tel: {customer.phone}</Text>}
            {customer.address && <Text style={styles.clientDetail}>{customer.address}</Text>}
          </View>
        )}

        {/* Tabla de ítems */}
        <View>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Descripción</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Precio unit.</Text>
            <Text style={[styles.tableHeaderCell, styles.colDisc]}>Desc %</Text>
            <Text style={[styles.tableHeaderCell, styles.colSubtotal]}>Subtotal</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
              <View style={styles.colDesc}>
                <Text style={styles.tableCell}>{item.name}</Text>
                {item.description ? <Text style={[styles.tableCell, { fontSize: 8, color: '#888' }]}>{item.description}</Text> : null}
              </View>
              <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, styles.colPrice]}>{fmt(item.unit_price, currency)}</Text>
              <Text style={[styles.tableCell, styles.colDisc]}>{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</Text>
              <Text style={[styles.tableCell, styles.colSubtotal]}>{fmt(item.subtotal, currency)}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(doc.subtotal, currency)}</Text>
          </View>
          {(doc.discount_amount || 0) > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Descuento</Text>
              <Text style={styles.totalsValue}>-{fmt(doc.discount_amount, currency)}</Text>
            </View>
          )}
          <View style={[styles.divider, { width: 200 }]} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalFinalLabel}>TOTAL</Text>
            <Text style={styles.totalFinalValue}>{fmt(doc.total, currency)}</Text>
          </View>
        </View>

        {/* Notas */}
        {doc.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text style={styles.notesText}>{doc.notes}</Text>
          </View>
        )}

        {/* Aviso: documento interno */}
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>Este documento es un comprobante interno y no tiene valor tributario. No es un documento electrónico (DTE) ni reemplaza a una factura o boleta oficial.</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{business?.name} — {docNum}</Text>
          <Text style={styles.footerText}>Generado el {today}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default function CrmDocumentPdf({ type, document: doc, business, customer, onClose }) {
  const filename = type === 'quote'
    ? `presupuesto-${formatQuoteNumber(doc?.quote_number)}.pdf`
    : `factura-${formatInvoiceNumber(doc?.invoice_number)}.pdf`;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 bg-[#1a2535] border-b border-white/10">
        <span className="text-white font-medium">{filename}</span>
        <div className="flex items-center gap-3">
          <PDFDownloadLink
            document={<CrmPdfDocument type={type} document={doc} business={business} customer={customer} />}
            fileName={filename}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            {({ loading }) => loading ? 'Preparando…' : <><Icon name="Download" size={15} />Descargar</>}
          </PDFDownloadLink>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white"><Icon name="X" size={20} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
          <CrmPdfDocument type={type} document={doc} business={business} customer={customer} />
        </PDFViewer>
      </div>
    </div>
  );
}
