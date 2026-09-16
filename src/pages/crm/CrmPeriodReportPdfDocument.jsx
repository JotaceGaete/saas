import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { buildPeriodReportViewModel } from './periodReportPdf';

// Misma paleta navy/blue que CrmResumenDiaPdfDocument.jsx / CrmDocumentPdf.jsx
// -- consistencia de marca entre todos los PDF de Walinka. Infraestructura
// YA existente (@react-pdf/renderer) -- no se agrega otra librería de PDF.
const C = {
  navy: '#1B2F4E', accent: '#2563EB', accentSoft: '#EFF6FF',
  gray100: '#F8FAFC', gray200: '#E2E8F0', gray400: '#94A3B8', gray600: '#475569', gray800: '#1E293B',
  white: '#FFFFFF',
  green: '#15803D', greenSoft: '#DCFCE7',
  yellow: '#B45309', yellowSoft: '#FEF9C3',
  red: '#B91C1C', redSoft: '#FEE2E2',
  blue: '#1D4ED8', blueSoft: '#DBEAFE',
};

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.gray800, backgroundColor: C.white, paddingBottom: 40 },
  topBand: { backgroundColor: C.navy, height: 6 },
  content: { paddingHorizontal: 40, paddingTop: 24 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logo: { width: 44, height: 44, objectFit: 'contain', marginBottom: 4 },
  bizName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 2 },
  headerRight: { alignItems: 'flex-end' },
  docType: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, textTransform: 'uppercase', letterSpacing: 1.2 },
  docDate: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.accent, marginTop: 3, textTransform: 'capitalize' },
  docMeta: { fontSize: 7.5, color: C.gray600, marginTop: 3 },
  divider: { height: 1, backgroundColor: C.gray200, marginBottom: 14 },

  headline: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 8 },
  headlineCard: { flex: 1, minWidth: 110, backgroundColor: C.gray100, borderRadius: 5, padding: 9 },
  headlineLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  headlineValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  headlineUnavailable: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.red },
  headlineDisclaimer: { fontSize: 6.5, color: C.gray400, marginTop: 2, lineHeight: 1.3 },
  headlineComparison: { fontSize: 6.5, color: C.gray600, marginTop: 2 },

  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 },
  sectionSubtitle: { fontSize: 7.5, color: C.gray400, marginBottom: 7 },

  unavailableBox: { backgroundColor: C.redSoft, borderRadius: 4, padding: 8, flexDirection: 'row' },
  unavailableText: { fontSize: 8, color: C.red, lineHeight: 1.4 },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  kpi: { flex: 1, minWidth: 90, backgroundColor: C.gray100, borderRadius: 4, padding: 7 },
  kpiLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  kpiValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.gray800 },

  table: { marginTop: 2 },
  thead: { flexDirection: 'row', backgroundColor: C.navy, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 3 },
  theadCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white },
  trow: { flexDirection: 'row', paddingHorizontal: 7, paddingVertical: 5.5, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  trowAlt: { backgroundColor: C.gray100 },
  tcell: { fontSize: 8, color: C.gray800 },
  emptyRow: { fontSize: 8, color: C.gray400, paddingVertical: 8, textAlign: 'center' },

  col1: { flex: 3 },
  col1b: { flex: 4 },
  colNum: { flex: 1, textAlign: 'right' },
  colNumS: { flex: 1.2, textAlign: 'right' },

  noteBox: { backgroundColor: C.gray100, borderRadius: 4, padding: 7, marginTop: 6 },
  noteText: { fontSize: 7.5, color: C.gray600, lineHeight: 1.4 },

  badge: { alignSelf: 'flex-start', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 5 },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },

  sessionBlock: { borderWidth: 1, borderColor: C.gray200, borderRadius: 5, padding: 8, marginBottom: 8 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sessionMeta: { fontSize: 7.5, color: C.gray400 },

  alertRow: { flexDirection: 'row', borderRadius: 4, padding: 6, marginBottom: 4 },
  alertText: { fontSize: 8, lineHeight: 1.4 },

  footer: { position: 'absolute', bottom: 16, left: 40, right: 40, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.gray400 },
});

const ALERT_TONE = { warning: { bg: C.yellowSoft, color: C.yellow }, info: { bg: C.blueSoft, color: C.blue }, error: { bg: C.redSoft, color: C.red } };

function Kpi({ label, item, tone }) {
  return (
    <View style={S.kpi} wrap={false}>
      <Text style={S.kpiLabel}>{label}</Text>
      {item.formatted != null ? <Text style={[S.kpiValue, tone ? { color: tone } : null]}>{item.formatted}</Text> : <Text style={S.headlineUnavailable}>No disponible</Text>}
    </View>
  );
}

function HeadlineCard({ label, item, tone, disclaimer, prefix, comparisonLabel }) {
  return (
    <View style={S.headlineCard} wrap={false}>
      <Text style={S.headlineLabel}>{label}</Text>
      {item.formatted != null ? <Text style={[S.headlineValue, tone ? { color: tone } : null]}>{prefix || ''}{item.formatted}</Text> : <Text style={S.headlineUnavailable}>No disponible</Text>}
      {item.comparison && item.comparison.state === 'normal' && (
        <Text style={S.headlineComparison}>{item.comparison.deltaPct > 0 ? '+' : ''}{item.comparison.deltaPct.toFixed(1)}% vs {comparisonLabel}</Text>
      )}
      {item.comparison && item.comparison.state === 'no_base' && <Text style={S.headlineComparison}>Sin base comparable en {comparisonLabel}</Text>}
      {disclaimer && <Text style={S.headlineDisclaimer}>{disclaimer}</Text>}
    </View>
  );
}

function Unavailable({ message }) {
  return <View style={S.unavailableBox} wrap={false}><Text style={S.unavailableText}>{message || 'No se pudo obtener esta información.'}</Text></View>;
}

function SalesEvolutionSection({ vm }) {
  if (!vm.available) {
    return <View style={S.section}><Text style={S.sectionTitle}>1. Ventas por día</Text><Unavailable message={vm.message} /></View>;
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>1. Ventas por día</Text>
      <Text style={S.sectionSubtitle}>
        Incluye días sin ventas ($0) -- {vm.activityDays?.daysWithSales ?? '—'} días con actividad, {vm.activityDays?.daysWithoutSales ?? '—'} sin ventas.
      </Text>
      <View style={S.table}>
        <View style={S.thead}>
          <Text style={[S.theadCell, S.col1b]}>Día</Text>
          <Text style={[S.theadCell, S.colNumS]}>Ventas netas</Text>
        </View>
        {vm.dailySeries.map((d, i) => (
          <View key={d.date} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
            <Text style={[S.tcell, S.col1b]}>{d.dateLabel}</Text>
            <Text style={[S.tcell, S.colNumS]}>{d.net > 0 ? new Intl.NumberFormat('es-CL').format(d.net) : '$0'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SalesSection({ vm }) {
  if (!vm.available) {
    return <View style={S.section}><Text style={S.sectionTitle}>2. Ventas</Text><Unavailable message={vm.message} /></View>;
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>2. Ventas</Text>
      <Text style={S.sectionSubtitle}>Notas de venta emitidas en el período (excluye anuladas)</Text>
      <View style={S.kpiRow}>
        <Kpi label="Bruta" item={vm.gross} />
        <Kpi label="Descuentos" item={vm.discount} />
        <Kpi label="Neta" item={vm.net} tone={C.blue} />
        <Kpi label="N° de ventas" item={{ formatted: vm.count != null ? String(vm.count) : null }} />
        <Kpi label="Ticket promedio" item={vm.avgTicket} />
        <Kpi label="Unidades vendidas" item={{ formatted: vm.unitsSold != null ? String(vm.unitsSold) : null }} />
      </View>
      <Text style={[S.sectionSubtitle, { marginTop: 4 }]}>Ventas por canal</Text>
      <View style={S.table}>
        {vm.byChannel.map((c, i) => (
          <View key={c.key} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
            <Text style={[S.tcell, S.col1b]}>{c.label}</Text>
            <Text style={[S.tcell, S.colNum]}>{c.formatted}</Text>
          </View>
        ))}
      </View>
      <Text style={[S.sectionSubtitle, { marginTop: 10 }]}>Productos más vendidos (Top 10)</Text>
      {vm.topProducts.length === 0 ? <Text style={S.emptyRow}>Sin ventas de productos en este período.</Text> : (
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.theadCell, S.col1b]}>Producto</Text>
            <Text style={[S.theadCell, S.colNum]}>Cantidad</Text>
            <Text style={[S.theadCell, S.colNumS]}>Ventas</Text>
          </View>
          {vm.topProducts.map((p, i) => (
            <View key={p.productId || i} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1b]}>{p.name}</Text>
              <Text style={[S.tcell, S.colNum]}>{p.quantity}</Text>
              <Text style={[S.tcell, S.colNumS]}>{p.formatted}</Text>
            </View>
          ))}
        </View>
      )}
      {vm.voidedCount > 0 && <Text style={[S.noteText, { marginTop: 6 }]}>{vm.voidedCount} venta{vm.voidedCount === 1 ? '' : 's'} anulada{vm.voidedCount === 1 ? '' : 's'} en el período.</Text>}
    </View>
  );
}

function CollectionsSection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>3. Dinero recibido</Text>
      <Text style={S.sectionSubtitle}>Pagos efectivamente recibidos en el período, por medio (cuenta corriente excluida)</Text>
      {!vm.available ? <Unavailable message={vm.message} /> : (
        <>
          {vm.byMethod.length === 0 ? <Text style={S.emptyRow}>Sin cobros registrados en este período.</Text> : (
            <View style={S.table}>
              <View style={S.thead}><Text style={[S.theadCell, S.col1b]}>Medio</Text><Text style={[S.theadCell, S.colNumS]}>Monto</Text></View>
              {vm.byMethod.map((m, i) => (
                <View key={m.method} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
                  <Text style={[S.tcell, S.col1b]}>{m.label}</Text>
                  <Text style={[S.tcell, S.colNumS]}>{m.formatted}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={[S.kpiRow, { marginTop: 8 }]}><Kpi label="Total recibido" item={vm.total} tone={C.green} /></View>
          {vm.vendidoVsCobrado?.available && (
            <View style={S.noteBox}>
              <Text style={S.noteText}>
                Vendido: {vm.vendidoVsCobrado.sold.formatted} · Cobrado: {vm.vendidoVsCobrado.collected.formatted} · De ventas del período: {vm.vendidoVsCobrado.collectedForPeriodSales.formatted} · De deudas anteriores: {vm.vendidoVsCobrado.collectedForPriorDebt.formatted}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function ExpensesSection({ vm }) {
  if (!vm.available) {
    return <View style={S.section}><Text style={S.sectionTitle}>4. Gastos</Text><Unavailable message={vm.message} /></View>;
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>4. Gastos</Text>
      <Text style={S.sectionSubtitle}>Gastos variables del período y otros egresos de caja que no son gasto</Text>
      <View style={S.kpiRow}>
        <Kpi label="Gastos registrados" item={vm.total} tone={C.red} />
        <Kpi label="Otros egresos de caja" item={vm.cashOutflowsNonExpense} />
      </View>
      {vm.byCategory.length === 0 ? <Text style={S.emptyRow}>Sin gastos registrados en este período.</Text> : (
        <View style={S.table}>
          <View style={S.thead}><Text style={[S.theadCell, S.col1b]}>Categoría</Text><Text style={[S.theadCell, S.colNum]}>%</Text><Text style={[S.theadCell, S.colNumS]}>Monto</Text></View>
          {vm.byCategory.map((c, i) => (
            <View key={c.key} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1b]}>{c.label}</Text>
              <Text style={[S.tcell, S.colNum]}>{c.pct}%</Text>
              <Text style={[S.tcell, S.colNumS]}>{c.formatted}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ProfitabilitySection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>Saldo antes de costo de mercadería</Text>
      {!vm.available ? <Unavailable message={vm.message} /> : (
        <>
          <Text style={[S.headlineValue, { fontSize: 16, color: vm.positive ? C.green : vm.negative ? C.red : C.gray600 }]}>{vm.positive ? '+' : ''}{vm.formatted}</Text>
          <View style={[S.noteBox, { backgroundColor: C.yellowSoft, marginTop: 6 }]}><Text style={[S.noteText, { color: C.yellow }]}>{vm.disclaimer}</Text></View>
        </>
      )}
    </View>
  );
}

function CashSection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>5. Caja y conciliación</Text>
      {!vm.available ? <Unavailable message={vm.message} /> : vm.sessions.length === 0 ? (
        <Text style={S.emptyRow}>No hubo caja abierta en este período.</Text>
      ) : (
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.theadCell, S.col1]}>Fecha</Text>
            <Text style={[S.theadCell, S.col1]}>Estado</Text>
            <Text style={[S.theadCell, S.colNum]}>Esperado</Text>
            <Text style={[S.theadCell, S.colNum]}>Conciliado</Text>
            <Text style={[S.theadCell, S.colNum]}>Diferencia</Text>
          </View>
          {vm.sessions.map((s, i) => (
            <View key={s.id} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1]}>{s.dateLabel}</Text>
              <Text style={[S.tcell, S.col1]}>{s.status === 'open' ? 'Abierta' : 'Cerrada'}</Text>
              {s.isLiveEstimate ? (
                <Text style={[S.tcell, S.colNum]}>{s.liveEstimateUnavailable ? 'No disp.' : (s.liveEstimate?.expectedCash?.formatted || '—')}</Text>
              ) : s.noReconciliation ? (
                <Text style={[S.tcell, S.colNum]}>Sin arqueo</Text>
              ) : s.message ? (
                <Text style={[S.tcell, S.colNum, { color: C.red }]}>{s.message}</Text>
              ) : (
                <>
                  <Text style={[S.tcell, S.colNum]}>{s.expected?.formatted}</Text>
                  <Text style={[S.tcell, S.colNum]}>{s.reconciled?.formatted}</Text>
                  <Text style={[S.tcell, S.colNum, { color: s.differenceSign > 0 ? C.green : s.differenceSign < 0 ? C.red : C.gray400 }]}>{s.differenceSign > 0 ? '+' : ''}{s.difference?.formatted}</Text>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function InventorySection({ vm }) {
  if (!vm.available) {
    return <View style={S.section}><Text style={S.sectionTitle}>6. Inventario</Text><Unavailable message={vm.message} /></View>;
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>6. Inventario</Text>
      <Text style={S.sectionSubtitle}>Movimientos de stock del período</Text>
      <View style={S.kpiRow}>
        <Kpi label="Entradas" item={{ formatted: String(vm.movementsSummary.entrada) }} />
        <Kpi label="Salidas" item={{ formatted: String(vm.movementsSummary.salida) }} />
        <Kpi label="Ajustes" item={{ formatted: String(vm.movementsSummary.ajuste) }} />
        <Kpi label="Bajo stock mínimo (actual)" item={{ formatted: String(vm.lowStockCount) }} tone={vm.lowStockCount > 0 ? C.yellow : null} />
      </View>
      <Text style={S.noteText}>&quot;Bajo stock mínimo&quot; refleja el stock ACTUAL, no el histórico del período.</Text>
    </View>
  );
}

function AlertsSection({ alerts }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>7. Alertas del período</Text>
      {alerts.length === 0 ? <Text style={S.emptyRow}>No se detectaron alertas relevantes para este período.</Text> : (
        alerts.map((a, i) => {
          const tone = ALERT_TONE[a.severity] || ALERT_TONE.info;
          return <View key={i} style={[S.alertRow, { backgroundColor: tone.bg }]} wrap={false}><Text style={[S.alertText, { color: tone.color }]}>{a.message}</Text></View>;
        })
      )}
    </View>
  );
}

/**
 * Documento react-pdf del Informe por período. Recibe periodSummary /
 * comparisonSummary YA calculados (misma referencia en memoria que ya usa
 * CrmInformesPeriodo.jsx) -- nunca vuelve a consultar getPeriodSummary.
 * Consume el MISMO buildPeriodReportViewModel que el PrintView -- ningún
 * segundo motor de cálculo. Sin placeholder de "Walinka IA" (ticket §17/§25:
 * nunca se incluye en el PDF).
 */
export default function CrmPeriodReportPdfDocument({ periodSummary, comparisonSummary, business, fromDate, toDate }) {
  const vm = buildPeriodReportViewModel(
    periodSummary,
    comparisonSummary,
    { businessName: business?.name, currency: business?.currency || 'CLP', logoUrl: business?.logoUrl || business?.logo_url || null },
    fromDate,
    toDate,
  );

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.topBand} />
        <View style={S.content}>
          <View style={S.header}>
            <View style={{ flex: 1 }}>
              {vm.meta.logoUrl && <Image src={vm.meta.logoUrl} style={S.logo} />}
              <Text style={S.bizName}>{vm.meta.businessName || 'Mi Negocio'}</Text>
            </View>
            <View style={S.headerRight}>
              <Text style={S.docType}>Informe del negocio</Text>
              <Text style={S.docDate}>{vm.meta.rangeLabel}</Text>
              {vm.meta.comparisonRangeLabel && <Text style={S.docMeta}>Comparado con: {vm.meta.comparisonRangeLabel}</Text>}
              {vm.meta.generatedAtLabel && <Text style={S.docMeta}>Generado el {vm.meta.generatedAtLabel}</Text>}
            </View>
          </View>
          <View style={S.divider} />

          <View style={S.headline}>
            <HeadlineCard label="Ventas netas" item={vm.kpis.netSales} tone={C.blue} comparisonLabel={vm.meta.comparisonRangeLabel} />
            <HeadlineCard label="Dinero recibido" item={vm.kpis.collected} tone={C.green} comparisonLabel={vm.meta.comparisonRangeLabel} />
            <HeadlineCard label="Gastos registrados" item={vm.kpis.expenses} tone={C.red} comparisonLabel={vm.meta.comparisonRangeLabel} />
            <HeadlineCard
              label="Saldo antes de costo de mercadería"
              item={vm.kpis.profitability}
              prefix={vm.profitability.available && vm.profitability.positive ? '+' : ''}
              tone={vm.profitability.available ? (vm.profitability.positive ? C.green : vm.profitability.negative ? C.red : C.gray600) : null}
              disclaimer="No es la ganancia del período — no incluye costo de mercadería"
              comparisonLabel={vm.meta.comparisonRangeLabel}
            />
          </View>

          <SalesEvolutionSection vm={vm.sales} />
          <SalesSection vm={vm.sales} />
          <CollectionsSection vm={vm.collections} />
          <ExpensesSection vm={vm.expenses} />
          <ProfitabilitySection vm={vm.profitability} />
          <CashSection vm={vm.cash} />
          <InventorySection vm={vm.inventory} />
          <AlertsSection alerts={vm.alerts} />
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>{vm.meta.businessName || ''} · Informe del negocio · {vm.meta.from} a {vm.meta.to}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages} · Generado por Walinka`} />
        </View>
      </Page>
    </Document>
  );
}
