import React from 'react';
import { buildPeriodReportViewModel } from './periodReportPdf';

/**
 * CrmPeriodReportPrintView.jsx — REPORTES-PERIODO-1.
 *
 * Documento de impresión DEDICADO del Informe por período, mismo patrón
 * exacto que CrmResumenDiaPrintView.jsx (ver esa página para el post-mortem
 * completo del bug de páginas fantasma con `visibility:hidden`): consume el
 * MISMO buildPeriodReportViewModel(...) que ya usa el PDF -- ningún cálculo
 * nuevo acá, solo layout compacto para A4.
 *
 *   getPeriodSummary → periodSummary → buildPeriodReportViewModel → { CrmInformesPeriodo (pantalla), PrintView, PDFDocument }
 *
 * `break-inside: avoid` SOLO en bloques chicos (.print-avoid-break: KPIs,
 * filas de tabla, bloques de sesión) -- nunca en una <section> completa.
 * `.print-heading` (break-after) evita que un título quede solo al pie de
 * página. Sin placeholder de IA (ticket §17/§25: nunca se imprime).
 */

function Kpi({ label, item, tone }) {
  return (
    <div className="print-avoid-break rounded border border-gray-200 bg-gray-50 px-2 py-1.5" style={{ minWidth: 90, flex: 1 }}>
      <p className="text-[6.5pt] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      {item?.formatted != null ? (
        <p className="text-[10pt] font-bold" style={tone ? { color: tone } : undefined}>{item.formatted}</p>
      ) : (
        <p className="text-[9pt] font-bold text-red-700">No disponible</p>
      )}
    </div>
  );
}

function HeadlineCard({ label, item, tone, disclaimer, prefix, comparisonLabel }) {
  return (
    <div className="print-avoid-break rounded bg-gray-50 px-2.5 py-2" style={{ minWidth: 110, flex: 1 }}>
      <p className="text-[6.5pt] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      {item?.formatted != null ? (
        <p className="text-[13pt] font-bold" style={tone ? { color: tone } : undefined}>{prefix || ''}{item.formatted}</p>
      ) : (
        <p className="text-[9pt] font-bold text-red-700">No disponible</p>
      )}
      {item?.comparison && item.comparison.state === 'normal' && (
        <p className="mt-0.5 text-[6.5pt] text-gray-500">{item.comparison.deltaPct > 0 ? '+' : ''}{item.comparison.deltaPct.toFixed(1)}% vs {comparisonLabel}</p>
      )}
      {item?.comparison && item.comparison.state === 'no_base' && <p className="mt-0.5 text-[6.5pt] text-gray-500">Sin base comparable en {comparisonLabel}</p>}
      {disclaimer && <p className="mt-0.5 text-[6.5pt] leading-tight text-gray-400">{disclaimer}</p>}
    </div>
  );
}

function Unavailable({ message }) {
  return <div className="print-avoid-break rounded bg-red-50 px-2 py-1.5 text-[8pt] leading-tight text-red-700">{message || 'No se pudo obtener esta información.'}</div>;
}

function Table({ head, rows, renderRow, emptyLabel }) {
  if (!rows.length) return <p className="py-2 text-center text-[8pt] text-gray-400">{emptyLabel}</p>;
  return (
    <table className="w-full border-collapse text-[8pt]">
      <thead>
        <tr className="print-avoid-break bg-[#1B2F4E] text-white">
          {head.map((h, i) => <th key={i} className={`px-1.5 py-1 text-[7pt] font-bold ${h.align === 'right' ? 'text-right' : 'text-left'}`}>{h.label}</th>)}
        </tr>
      </thead>
      <tbody>{rows.map((row, i) => renderRow(row, i))}</tbody>
    </table>
  );
}

function SalesEvolutionSection({ vm }) {
  if (!vm.available) {
    return (
      <section className="mb-4">
        <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">1. Ventas por día</h2>
        <Unavailable message={vm.message} />
      </section>
    );
  }
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">1. Ventas por día</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Incluye días sin ventas ($0) -- días con actividad: {vm.activityDays?.daysWithSales ?? '—'}, sin ventas: {vm.activityDays?.daysWithoutSales ?? '—'}</p>
      {vm.activityDays?.maxDay && (
        <p className="mb-1 text-[7.5pt] text-gray-500">Día con más ventas: {vm.activityDays.maxDay.dateLabel} ({vm.activityDays.maxDay.formatted}) · Día con menos ventas: {vm.activityDays.minDay.dateLabel} ({vm.activityDays.minDay.formatted})</p>
      )}
      <Table
        head={[{ label: 'Día' }, { label: 'Ventas netas', align: 'right' }]}
        rows={vm.dailySeries}
        emptyLabel="Sin días en el rango."
        renderRow={(d, i) => (
          <tr key={d.date} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
            <td className="px-1.5 py-1">{d.dateLabel}</td>
            <td className="px-1.5 py-1 text-right">{d.net > 0 ? new Intl.NumberFormat('es-CL').format(d.net) : '$0'}</td>
          </tr>
        )}
      />
    </section>
  );
}

function SalesSection({ vm }) {
  if (!vm.available) {
    return (
      <section className="mb-4">
        <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">2. Ventas</h2>
        <Unavailable message={vm.message} />
      </section>
    );
  }
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">2. Ventas</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Notas de venta emitidas en el período (excluye anuladas)</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Kpi label="Bruta" item={vm.gross} />
        <Kpi label="Descuentos" item={vm.discount} />
        <Kpi label="Neta" item={vm.net} tone="#1D4ED8" />
        <Kpi label="N° de ventas" item={{ formatted: vm.count != null ? String(vm.count) : null }} />
        <Kpi label="Ticket promedio" item={vm.avgTicket} />
        <Kpi label="Unidades vendidas" item={{ formatted: vm.unitsSold != null ? String(vm.unitsSold) : null }} />
      </div>
      <p className="mb-1 text-[7.5pt] font-bold uppercase tracking-wide text-gray-400">Ventas por canal</p>
      <Table head={[{ label: 'Canal' }, { label: 'Monto', align: 'right' }]} rows={vm.byChannel} emptyLabel="Sin ventas en este período." renderRow={(c, i) => (
        <tr key={c.key} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}><td className="px-1.5 py-1">{c.label}</td><td className="px-1.5 py-1 text-right">{c.formatted}</td></tr>
      )} />
      <p className="mb-1 mt-2 text-[7.5pt] font-bold uppercase tracking-wide text-gray-400">Productos más vendidos (Top 10)</p>
      <Table head={[{ label: 'Producto' }, { label: 'Cant.', align: 'right' }, { label: 'Ventas', align: 'right' }]} rows={vm.topProducts} emptyLabel="Sin ventas de productos en este período." renderRow={(p, i) => (
        <tr key={p.productId || i} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}><td className="px-1.5 py-1">{p.name}</td><td className="px-1.5 py-1 text-right">{p.quantity}</td><td className="px-1.5 py-1 text-right">{p.formatted}</td></tr>
      )} />
      {vm.voidedCount > 0 && <p className="mt-1.5 text-[7.5pt] text-gray-500">{vm.voidedCount} venta{vm.voidedCount === 1 ? '' : 's'} anulada{vm.voidedCount === 1 ? '' : 's'} en el período.</p>}
    </section>
  );
}

function CollectionsSection({ vm }) {
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">3. Dinero recibido</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Pagos efectivamente recibidos en el período, por medio (cuenta corriente excluida)</p>
      {!vm.available ? <Unavailable message={vm.message} /> : (
        <>
          <Table head={[{ label: 'Medio' }, { label: 'Monto', align: 'right' }]} rows={vm.byMethod} emptyLabel="Sin cobros registrados en este período." renderRow={(m, i) => (
            <tr key={m.method} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}><td className="px-1.5 py-1">{m.label}</td><td className="px-1.5 py-1 text-right">{m.formatted}</td></tr>
          )} />
          <div className="mt-2 flex flex-wrap gap-1.5"><Kpi label="Total recibido" item={vm.total} tone="#15803D" /></div>
          {vm.vendidoVsCobrado?.available && (
            <p className="print-avoid-break mt-1.5 rounded bg-gray-50 px-2 py-1.5 text-[7.5pt] leading-tight text-gray-600">
              Vendido: {vm.vendidoVsCobrado.sold.formatted} · Cobrado: {vm.vendidoVsCobrado.collected.formatted} · De ventas del período: {vm.vendidoVsCobrado.collectedForPeriodSales.formatted} · De deudas anteriores: {vm.vendidoVsCobrado.collectedForPriorDebt.formatted}
              {vm.vendidoVsCobrado.collectedForFutureInvoices?.value > 0 && ` · De facturas con fecha posterior al período (dato inconsistente): ${vm.vendidoVsCobrado.collectedForFutureInvoices.formatted}`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ExpensesSection({ vm }) {
  if (!vm.available) {
    return <section className="mb-4"><h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">4. Gastos</h2><Unavailable message={vm.message} /></section>;
  }
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">4. Gastos</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Gastos variables del período y otros egresos de caja que no son gasto</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Kpi label="Gastos registrados" item={vm.total} tone="#B91C1C" />
        <Kpi label="Otros egresos de caja" item={vm.cashOutflowsNonExpense} />
      </div>
      <Table head={[{ label: 'Categoría' }, { label: '%', align: 'right' }, { label: 'Monto', align: 'right' }]} rows={vm.byCategory} emptyLabel="Sin gastos registrados en este período." renderRow={(c, i) => (
        <tr key={c.key} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}><td className="px-1.5 py-1">{c.label}</td><td className="px-1.5 py-1 text-right">{c.pct}%</td><td className="px-1.5 py-1 text-right">{c.formatted}</td></tr>
      )} />
    </section>
  );
}

function ProfitabilitySection({ vm }) {
  return (
    <section className="print-avoid-break mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">Saldo antes de costo de mercadería</h2>
      {!vm.available ? <Unavailable message={vm.message} /> : (
        <>
          <p className="text-[15pt] font-bold" style={{ color: vm.positive ? '#15803D' : vm.negative ? '#B91C1C' : '#475569' }}>{vm.positive ? '+' : ''}{vm.formatted}</p>
          <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[7.5pt] leading-tight text-amber-800">{vm.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function CashSection({ vm }) {
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">5. Caja y conciliación</h2>
      {!vm.available ? <Unavailable message={vm.message} /> : vm.sessions.length === 0 ? (
        <p className="py-2 text-center text-[8pt] text-gray-400">No hubo caja abierta en este período.</p>
      ) : (
        <Table
          head={[{ label: 'Fecha' }, { label: 'Estado' }, { label: 'Esperado', align: 'right' }, { label: 'Conciliado', align: 'right' }, { label: 'Diferencia', align: 'right' }]}
          rows={vm.sessions}
          emptyLabel=""
          renderRow={(s, i) => (
            <tr key={s.id} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
              <td className="px-1.5 py-1">{s.dateLabel}</td>
              <td className="px-1.5 py-1">{s.status === 'open' ? 'Abierta' : 'Cerrada'}</td>
              {s.isLiveEstimate ? (
                <td className="px-1.5 py-1 text-right text-gray-500" colSpan={3}>{s.liveEstimateUnavailable ? 'No disponible' : `Provisional (${s.liveEstimate?.expectedCash?.formatted || '—'})`}</td>
              ) : s.noReconciliation ? (
                <td className="px-1.5 py-1 text-gray-400" colSpan={3}>Sin arqueo registrado</td>
              ) : s.message ? (
                <td className="px-1.5 py-1 text-red-600" colSpan={3}>{s.message}</td>
              ) : (
                <>
                  <td className="px-1.5 py-1 text-right">{s.expected?.formatted}</td>
                  <td className="px-1.5 py-1 text-right">{s.reconciled?.formatted}</td>
                  <td className="px-1.5 py-1 text-right" style={{ color: s.differenceSign > 0 ? '#15803D' : s.differenceSign < 0 ? '#B91C1C' : '#94A3B8' }}>{s.differenceSign > 0 ? '+' : ''}{s.difference?.formatted}</td>
                </>
              )}
            </tr>
          )}
        />
      )}
    </section>
  );
}

function InventorySection({ vm }) {
  if (!vm.available) {
    return <section className="mb-4"><h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">6. Inventario</h2><Unavailable message={vm.message} /></section>;
  }
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">6. Inventario</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Movimientos de stock del período</p>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <Kpi label="Entradas" item={{ formatted: String(vm.movementsSummary.entrada) }} />
        <Kpi label="Salidas" item={{ formatted: String(vm.movementsSummary.salida) }} />
        <Kpi label="Ajustes" item={{ formatted: String(vm.movementsSummary.ajuste) }} />
        <Kpi label="Bajo stock mínimo (actual)" item={{ formatted: String(vm.lowStockCount) }} tone={vm.lowStockCount > 0 ? '#B45309' : undefined} />
      </div>
      <p className="text-[7.5pt] text-gray-500">&quot;Bajo stock mínimo&quot; refleja el stock ACTUAL, no el histórico del período.</p>
    </section>
  );
}

function AlertsSection({ alerts }) {
  return (
    <section className="mb-4">
      <h2 className="print-heading mb-1.5 text-[10.5pt] font-bold text-[#1B2F4E]">7. Alertas del período</h2>
      {alerts.length === 0 ? (
        <p className="py-2 text-center text-[8pt] text-gray-400">No se detectaron alertas relevantes para este período.</p>
      ) : (
        alerts.map((a, i) => {
          const tone = { warning: { bg: '#FEF9C3', color: '#B45309' }, info: { bg: '#DBEAFE', color: '#1D4ED8' }, error: { bg: '#FEE2E2', color: '#B91C1C' } }[a.severity] || { bg: '#DBEAFE', color: '#1D4ED8' };
          return <div key={i} className="print-avoid-break mb-1 rounded px-2 py-1 text-[8pt] leading-tight" style={{ backgroundColor: tone.bg, color: tone.color }}>{a.message}</div>;
        })
      )}
    </section>
  );
}

export default function CrmPeriodReportPrintView({ periodSummary, comparisonSummary, business, fromDate, toDate }) {
  const vm = buildPeriodReportViewModel(periodSummary, comparisonSummary, { businessName: business?.name, currency: business?.currency || 'CLP', logoUrl: business?.logoUrl || business?.logo_url || null }, fromDate, toDate);

  return (
    <div className="text-gray-800" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div className="print-avoid-break mb-3 flex items-start justify-between gap-4 border-b border-gray-200 pb-2">
        <div>
          {vm.meta.logoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={vm.meta.logoUrl} className="mb-1 h-10 w-10 object-contain" />
          )}
          <p className="text-[15pt] font-bold text-[#1B2F4E]">{vm.meta.businessName || 'Mi Negocio'}</p>
        </div>
        <div className="text-right">
          <p className="text-[15pt] font-bold uppercase tracking-wide text-[#1B2F4E]">Informe del negocio</p>
          <p className="text-[10pt] font-bold capitalize text-[#2563EB]">{vm.meta.rangeLabel}</p>
          {vm.meta.comparisonRangeLabel && <p className="text-[7.5pt] text-gray-500">Comparado con: {vm.meta.comparisonRangeLabel}</p>}
          {vm.meta.generatedAtLabel && <p className="text-[7.5pt] text-gray-500">Generado el {vm.meta.generatedAtLabel} · Generado por Walinka</p>}
        </div>
      </div>

      <div className="print-avoid-break mb-3 flex flex-wrap gap-1.5">
        <HeadlineCard label="Ventas netas" item={vm.kpis.netSales} tone="#1D4ED8" comparisonLabel={vm.meta.comparisonRangeLabel} />
        <HeadlineCard label="Dinero recibido" item={vm.kpis.collected} tone="#15803D" comparisonLabel={vm.meta.comparisonRangeLabel} />
        <HeadlineCard label="Gastos registrados" item={vm.kpis.expenses} tone="#B91C1C" comparisonLabel={vm.meta.comparisonRangeLabel} />
        <HeadlineCard
          label="Saldo antes de costo de mercadería"
          item={vm.kpis.profitability}
          prefix={vm.profitability.available && vm.profitability.positive ? '+' : ''}
          tone={vm.profitability.available ? (vm.profitability.positive ? '#15803D' : vm.profitability.negative ? '#B91C1C' : '#475569') : undefined}
          disclaimer="No es la ganancia del período — no incluye costo de mercadería"
          comparisonLabel={vm.meta.comparisonRangeLabel}
        />
      </div>

      <SalesEvolutionSection vm={vm.sales} />
      <SalesSection vm={vm.sales} />
      <CollectionsSection vm={vm.collections} />
      <ExpensesSection vm={vm.expenses} />
      <ProfitabilitySection vm={vm.profitability} />
      <CashSection vm={vm.cash} />
      <InventorySection vm={vm.inventory} />
      <AlertsSection alerts={vm.alerts} />

      <div className="mt-2 flex justify-between border-t border-gray-200 pt-1.5 text-[7pt] text-gray-400">
        <span>{vm.meta.businessName || ''} · Informe del negocio · {vm.meta.from} a {vm.meta.to}</span>
        <span>Generado por Walinka</span>
      </div>
    </div>
  );
}
