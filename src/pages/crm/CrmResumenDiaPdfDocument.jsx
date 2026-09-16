import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { buildResumenDiaPdfViewModel } from './resumenDiaPdf';

// ─── Paleta ─────────────────────────────────────────────────────────────────
// Misma paleta navy/blue que CrmDocumentPdf.jsx (cotizaciones/notas de venta)
// -- consistencia de marca entre todos los PDF que genera Walinka.
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

  historicalNotice: { backgroundColor: C.yellowSoft, borderRadius: 4, padding: 7, marginBottom: 12 },
  historicalText: { fontSize: 7.5, color: C.yellow, lineHeight: 1.4 },

  headline: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 8 },
  headlineCard: { flex: 1, minWidth: 110, backgroundColor: C.gray100, borderRadius: 5, padding: 9 },
  headlineLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  headlineValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  headlineUnavailable: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.red },
  headlineDisclaimer: { fontSize: 6.5, color: C.gray400, marginTop: 2, lineHeight: 1.3 },

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

const ALERT_TONE = {
  warning: { bg: C.yellowSoft, color: C.yellow },
  info: { bg: C.blueSoft, color: C.blue },
  error: { bg: C.redSoft, color: C.red },
};

function Kpi({ label, item, tone }) {
  return (
    <View style={S.kpi} wrap={false}>
      <Text style={S.kpiLabel}>{label}</Text>
      {item.formatted != null ? (
        <Text style={[S.kpiValue, tone ? { color: tone } : null]}>{item.formatted}</Text>
      ) : (
        <Text style={S.headlineUnavailable}>No disponible</Text>
      )}
    </View>
  );
}

function HeadlineCard({ label, item, tone, disclaimer, prefix }) {
  return (
    <View style={S.headlineCard} wrap={false}>
      <Text style={S.headlineLabel}>{label}</Text>
      {item.formatted != null ? (
        <Text style={[S.headlineValue, tone ? { color: tone } : null]}>{prefix || ''}{item.formatted}</Text>
      ) : (
        <Text style={S.headlineUnavailable}>No disponible</Text>
      )}
      {disclaimer && <Text style={S.headlineDisclaimer}>{disclaimer}</Text>}
    </View>
  );
}

function Unavailable({ message }) {
  return (
    <View style={S.unavailableBox} wrap={false}>
      <Text style={S.unavailableText}>{message || 'No se pudo obtener esta información.'}</Text>
    </View>
  );
}

function SalesSection({ vm }) {
  if (!vm.available) {
    return (
      <View style={S.section}>
        <Text style={S.sectionTitle}>1. Ventas</Text>
        <Unavailable message={vm.message} />
      </View>
    );
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>1. Ventas</Text>
      <Text style={S.sectionSubtitle}>Notas de venta emitidas este día (excluye anuladas)</Text>

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

      <Text style={[S.sectionSubtitle, { marginTop: 10 }]}>Productos más vendidos</Text>
      {vm.topProducts.length === 0 ? (
        <Text style={S.emptyRow}>Sin ventas de productos este día.</Text>
      ) : (
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.theadCell, S.col1b]}>Producto</Text>
            <Text style={[S.theadCell, S.colNum]}>Cantidad</Text>
            <Text style={[S.theadCell, S.colNumS]}>Subtotal</Text>
          </View>
          {vm.topProducts.map((p, i) => (
            <View key={p.productId || p.name || i} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1b]}>{p.name}</Text>
              <Text style={[S.tcell, S.colNum]}>{p.quantity}</Text>
              <Text style={[S.tcell, S.colNumS]}>{p.formatted}</Text>
            </View>
          ))}
        </View>
      )}
      {vm.voidedCount > 0 && (
        <Text style={[S.noteText, { marginTop: 6 }]}>
          {vm.voidedCount} venta{vm.voidedCount === 1 ? '' : 's'} anulada{vm.voidedCount === 1 ? '' : 's'} este día (no incluida{vm.voidedCount === 1 ? '' : 's'} arriba).
        </Text>
      )}
    </View>
  );
}

function CollectionsSection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>2. Dinero recibido</Text>
      <Text style={S.sectionSubtitle}>Pagos efectivamente recibidos este día, por medio</Text>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : (
        <>
          {vm.byMethod.length === 0 ? (
            <Text style={S.emptyRow}>Sin cobros registrados este día.</Text>
          ) : (
            <View style={S.table}>
              <View style={S.thead}>
                <Text style={[S.theadCell, S.col1b]}>Medio</Text>
                <Text style={[S.theadCell, S.colNumS]}>Monto</Text>
              </View>
              {vm.byMethod.map((m, i) => (
                <View key={m.method} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
                  <Text style={[S.tcell, S.col1b]}>{m.label}</Text>
                  <Text style={[S.tcell, S.colNumS]}>{m.formatted}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={[S.kpiRow, { marginTop: 8 }]}>
            <Kpi label="Total recibido" item={vm.total} tone={C.green} />
          </View>
        </>
      )}
      {vm.pendingTodayAvailable ? (
        vm.pendingToday.value > 0 && (
          <Text style={S.noteText}>Ventas de hoy pendientes de cobro: {vm.pendingToday.formatted}</Text>
        )
      ) : (
        <Text style={[S.noteText, { color: C.red }]}>No pudimos calcular las ventas pendientes de cobro de este día.</Text>
      )}
    </View>
  );
}

function ExpensesSection({ vm }) {
  if (!vm.available) {
    return (
      <View style={S.section}>
        <Text style={S.sectionTitle}>3. Gastos y egresos</Text>
        <Unavailable message={vm.message} />
      </View>
    );
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>3. Gastos y egresos</Text>
      <Text style={S.sectionSubtitle}>Gastos variables del día y otros movimientos de caja que no son gasto</Text>
      <View style={S.kpiRow}>
        <Kpi label="Gastos del día" item={vm.total} tone={C.red} />
        <Kpi label="Otros egresos de caja" item={vm.cashOutflowsNonExpense} />
      </View>
      {vm.byCategory.length === 0 ? (
        <Text style={S.emptyRow}>Sin gastos registrados este día.</Text>
      ) : (
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.theadCell, S.col1b]}>Categoría</Text>
            <Text style={[S.theadCell, S.colNumS]}>Monto</Text>
          </View>
          {vm.byCategory.map((c, i) => (
            <View key={c.key} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1b]}>{c.label}</Text>
              <Text style={[S.tcell, S.colNumS]}>{c.formatted}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={S.noteBox}>
        <Text style={S.noteText}>
          &quot;Otros egresos de caja&quot; (retiros, traslados) no está incluido en el total de gastos de arriba -- no son gasto y no se suman dos veces.
        </Text>
      </View>
    </View>
  );
}

function ProfitabilitySection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>Saldo antes de costo de mercadería</Text>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : (
        <>
          <Text style={[S.headlineValue, { fontSize: 16, color: vm.positive ? C.green : vm.negative ? C.red : C.gray600 }]}>
            {vm.positive ? '+' : ''}{vm.formatted}
          </Text>
          <View style={[S.noteBox, { backgroundColor: C.yellowSoft, marginTop: 6 }]}>
            <Text style={[S.noteText, { color: C.yellow }]}>
              Ventas netas menos gastos registrados. No incluye el costo de los productos vendidos, por lo que no representa la ganancia del día.
            </Text>
          </View>
          <View style={S.noteBox}>
            <Text style={S.noteText}>{vm.disclaimer}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function ReconciliationTable({ rows }) {
  return (
    <View style={S.table}>
      <View style={S.thead}>
        <Text style={[S.theadCell, S.col1]}>Medio</Text>
        <Text style={[S.theadCell, S.colNum]}>Esperado</Text>
        <Text style={[S.theadCell, S.colNum]}>Conciliado</Text>
        <Text style={[S.theadCell, S.colNum]}>Diferencia</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.id || r.method} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
          <Text style={[S.tcell, S.col1]}>{r.label}</Text>
          <Text style={[S.tcell, S.colNum]}>{r.expected.formatted}</Text>
          <Text style={[S.tcell, S.colNum]}>{r.reconciled.formatted}</Text>
          <Text style={[S.tcell, S.colNum, { color: r.differenceSign > 0 ? C.green : r.differenceSign < 0 ? C.red : C.gray400 }]}>
            {r.differenceSign > 0 ? '+' : ''}{r.difference.formatted}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CashSession({ session }) {
  const statusBg = session.status === 'open' ? C.greenSoft : C.gray100;
  const statusColor = session.status === 'open' ? C.green : C.gray600;
  return (
    <View style={S.sessionBlock} wrap={false}>
      <View style={S.sessionHeader}>
        <View style={[S.badge, { backgroundColor: statusBg }]}>
          <Text style={[S.badgeText, { color: statusColor }]}>{session.status === 'open' ? 'Caja abierta' : 'Caja cerrada'}</Text>
        </View>
        <Text style={S.sessionMeta}>
          Apertura {session.openedAtLabel}{session.closedAtLabel ? ` · Cierre ${session.closedAtLabel}` : ''}
        </Text>
      </View>

      {session.message && <Unavailable message={session.message} />}

      {session.isLiveEstimate && session.liveEstimate && (
        <>
          <Text style={[S.noteText, { color: C.yellow, marginBottom: 4 }]}>Caja abierta — valores provisionales (estimado en vivo, no es un arqueo definitivo)</Text>
          <View style={S.kpiRow}>
            <Kpi label="Fondo inicial" item={session.liveEstimate.initialAmount} />
            <Kpi label="Cobros en efectivo" item={session.liveEstimate.cashReceived} tone={C.green} />
            <Kpi label="Salidas en efectivo" item={session.liveEstimate.cashOutflow} tone={C.red} />
            <Kpi label="Efectivo esperado en caja" item={session.liveEstimate.expectedCash} />
          </View>
          {session.liveEstimate.receivedByMethod.length > 0 && (
            <>
              <Text style={[S.sectionSubtitle, { marginTop: 4 }]}>Recibido por otros medios (no aumenta el efectivo físico)</Text>
              <View style={S.kpiRow}>
                {session.liveEstimate.receivedByMethod.map(m => (
                  <Kpi key={m.method} label={m.label} item={m} />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {!session.isLiveEstimate && session.reconciliation && <ReconciliationTable rows={session.reconciliation} />}
      {!session.isLiveEstimate && session.noReconciliation && (
        <Text style={S.emptyRow}>Sin arqueo registrado para esta caja (cierre anterior al asistente de conciliación).</Text>
      )}
    </View>
  );
}

function CashSection({ vm }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>4. Caja y conciliación</Text>
      <Text style={S.sectionSubtitle}>Puede haber más de una caja abierta/cerrada este día (cambios de turno)</Text>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : vm.sessions.length === 0 ? (
        <Text style={S.emptyRow}>No hubo caja abierta este día.</Text>
      ) : (
        vm.sessions.map(session => <CashSession key={session.id} session={session} />)
      )}
    </View>
  );
}

function InventorySection({ vm }) {
  if (!vm.available) {
    return (
      <View style={S.section}>
        <Text style={S.sectionTitle}>5. Inventario</Text>
        <Unavailable message={vm.message} />
      </View>
    );
  }
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>5. Inventario</Text>
      <Text style={S.sectionSubtitle}>Movimientos de stock registrados este día</Text>
      <View style={S.kpiRow}>
        <Kpi label="Entradas" item={{ formatted: String(vm.movementsSummary.entrada) }} />
        <Kpi label="Salidas" item={{ formatted: String(vm.movementsSummary.salida) }} />
        <Kpi label="Ajustes" item={{ formatted: String(vm.movementsSummary.ajuste) }} />
        <Kpi label="Bajo stock mínimo" item={{ formatted: String(vm.lowStockCount) }} tone={vm.lowStockCount > 0 ? C.yellow : null} />
      </View>
      {!vm.isLowStockForToday && (
        <Text style={S.noteText}>&quot;Bajo stock mínimo&quot; refleja el stock actual, no el de esta fecha.</Text>
      )}
      {vm.notableMovements.length > 0 && (
        <View style={[S.table, { marginTop: 8 }]}>
          <View style={S.thead}>
            <Text style={[S.theadCell, S.col1b]}>Producto</Text>
            <Text style={[S.theadCell, S.col1]}>Tipo</Text>
            <Text style={[S.theadCell, S.colNum]}>Cantidad</Text>
            <Text style={[S.theadCell, S.colNum]}>Hora</Text>
          </View>
          {vm.notableMovements.map((m, i) => (
            <View key={i} style={[S.trow, i % 2 === 1 ? S.trowAlt : null]} wrap={false}>
              <Text style={[S.tcell, S.col1b]}>{m.productName}</Text>
              <Text style={[S.tcell, S.col1]}>{m.typeLabel}</Text>
              <Text style={[S.tcell, S.colNum]}>{m.quantity}</Text>
              <Text style={[S.tcell, S.colNum]}>{m.createdAtLabel}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AlertsSection({ alerts }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>6. Alertas</Text>
      {alerts.length === 0 ? (
        <Text style={S.emptyRow}>Sin alertas para este día.</Text>
      ) : (
        alerts.map((a, i) => {
          const tone = ALERT_TONE[a.severity] || ALERT_TONE.info;
          return (
            <View key={i} style={[S.alertRow, { backgroundColor: tone.bg }]} wrap={false}>
              <Text style={[S.alertText, { color: tone.color }]}>{a.message}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

/**
 * Documento react-pdf del Resumen del día. Recibe el MISMO `summary` que ya
 * está en memoria en CrmResumenDia.jsx (via getDailySummary) -- nunca vuelve
 * a consultarlo. Construye internamente el view-model con
 * buildResumenDiaPdfViewModel para no duplicar esa lógica de
 * formateo/etiquetado en dos lugares.
 */
export default function CrmResumenDiaPdfDocument({ summary, business, date }) {
  const vm = buildResumenDiaPdfViewModel(
    summary,
    { businessName: business?.name, currency: business?.currency || 'CLP', logoUrl: business?.logoUrl || business?.logo_url || null },
    date,
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
              <Text style={S.docType}>Resumen del día</Text>
              <Text style={S.docDate}>{vm.meta.dateLabel}</Text>
              {vm.meta.generatedAtLabel && <Text style={S.docMeta}>Generado el {vm.meta.generatedAtLabel}</Text>}
            </View>
          </View>
          <View style={S.divider} />

          {vm.meta.isToday === false && (
            <View style={S.historicalNotice} wrap={false}>
              <Text style={S.historicalText}>
                Fecha histórica — algunos datos reflejan el estado actual, no el de ese día.
                {vm.meta.historicalLimitations.length > 0 ? ` ${vm.meta.historicalLimitations.join(' ')}` : ''}
              </Text>
            </View>
          )}

          <View style={S.headline}>
            <HeadlineCard label="Ventas netas" item={vm.sales.available ? vm.sales.net : { formatted: null }} tone={C.blue} />
            <HeadlineCard label="Dinero recibido" item={vm.collections.total} tone={C.green} />
            <HeadlineCard label="Gastos" item={vm.expenses.available ? vm.expenses.total : { formatted: null }} tone={C.red} />
            <HeadlineCard
              label="Saldo antes de costo de mercadería"
              item={vm.profitability.available ? vm.profitability : { formatted: null }}
              prefix={vm.profitability.available && vm.profitability.positive ? '+' : ''}
              tone={vm.profitability.available ? (vm.profitability.positive ? C.green : vm.profitability.negative ? C.red : C.gray600) : null}
              disclaimer="No es la ganancia del día — no incluye costo de mercadería"
            />
          </View>

          <SalesSection vm={vm.sales} />
          <CollectionsSection vm={vm.collections} />
          <ExpensesSection vm={vm.expenses} />
          <ProfitabilitySection vm={vm.profitability} />
          <CashSection vm={vm.cash} />
          <InventorySection vm={vm.inventory} />
          <AlertsSection alerts={vm.alerts} />
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>{vm.meta.businessName || ''} · Resumen del día · {vm.meta.date}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages} · Generado por Walinka`} />
        </View>
      </Page>
    </Document>
  );
}
