import React from 'react';
import { buildResumenDiaPdfViewModel } from './resumenDiaPdf';

/**
 * CrmResumenDiaPrintView.jsx — RESUMEN-DEL-DIA-2 (corrección de impresión).
 *
 * Documento de impresión DEDICADO, independiente del dashboard de pantalla.
 * window.print() ya NO imprime las tarjetas de CrmResumenDia.jsx (eso era el
 * bug: demasiado espacio en blanco, tarjetas grandes pensadas para pantalla,
 * cortes de página pobres, 4 páginas para poca información) -- imprime
 * exclusivamente este componente, compacto y diseñado para A4.
 *
 * Consume el MISMO buildResumenDiaPdfViewModel(summary, ...) que ya usa
 * CrmResumenDiaPdfDocument.jsx (el PDF) -- mismo contenido/orden/etiquetas en
 * ambos, sin un segundo motor de cálculo ni una segunda capa de formateo:
 *
 *   getDailySummary → summary → buildResumenDiaPdfViewModel → { PrintView, PDFDocument }
 *
 * No recibe ni llama a getDailySummary -- recibe `summary` ya calculado
 * (mismo objeto en memoria que ya tiene CrmResumenDia.jsx) como prop.
 *
 * Paginación: `break-inside: avoid` se aplica SOLO a bloques chicos
 * (encabezado+primera fila, tarjetas de resumen, filas de tabla, cajas de
 * nota) -- nunca a una <section> completa grande, que es exactamente lo que
 * producía el bug original (secciones largas forzadas a cursor su propia
 * página, con enormes espacios en blanco). Las tablas largas fluyen
 * naturalmente entre páginas.
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

function HeadlineCard({ label, item, tone, disclaimer, prefix }) {
  return (
    <div className="print-avoid-break rounded bg-gray-50 px-2.5 py-2" style={{ minWidth: 110, flex: 1 }}>
      <p className="text-[6.5pt] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      {item?.formatted != null ? (
        <p className="text-[13pt] font-bold" style={tone ? { color: tone } : undefined}>{prefix || ''}{item.formatted}</p>
      ) : (
        <p className="text-[9pt] font-bold text-red-700">No disponible</p>
      )}
      {disclaimer && <p className="mt-0.5 text-[6.5pt] leading-tight text-gray-400">{disclaimer}</p>}
    </div>
  );
}

function Unavailable({ message }) {
  return (
    <div className="print-avoid-break rounded bg-red-50 px-2 py-1.5 text-[8pt] leading-tight text-red-700">
      {message || 'No se pudo obtener esta información.'}
    </div>
  );
}

function Table({ head, rows, renderRow, emptyLabel }) {
  if (!rows.length) {
    return <p className="py-2 text-center text-[8pt] text-gray-400">{emptyLabel}</p>;
  }
  return (
    <table className="w-full border-collapse text-[8pt]">
      <thead>
        <tr className="print-avoid-break bg-[#1B2F4E] text-white">
          {head.map((h, i) => (
            <th key={i} className={`px-1.5 py-1 text-[7pt] font-bold ${h.align === 'right' ? 'text-right' : 'text-left'}`}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => renderRow(row, i))}
      </tbody>
    </table>
  );
}

function SalesSection({ vm }) {
  if (!vm.available) {
    return (
      <section className="mb-3">
        <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">1. Ventas</h2>
        <Unavailable message={vm.message} />
      </section>
    );
  }
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">1. Ventas</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Notas de venta emitidas este día (excluye anuladas)</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Kpi label="Bruta" item={vm.gross} />
        <Kpi label="Descuentos" item={vm.discount} />
        <Kpi label="Neta" item={vm.net} tone="#1D4ED8" />
        <Kpi label="N° de ventas" item={{ formatted: vm.count != null ? String(vm.count) : null }} />
        <Kpi label="Ticket promedio" item={vm.avgTicket} />
        <Kpi label="Unidades vendidas" item={{ formatted: vm.unitsSold != null ? String(vm.unitsSold) : null }} />
      </div>

      <p className="mb-1 text-[7.5pt] font-bold uppercase tracking-wide text-gray-400">Ventas por canal</p>
      <Table
        head={[{ label: 'Canal' }, { label: 'Monto', align: 'right' }]}
        rows={vm.byChannel}
        emptyLabel="Sin ventas este día."
        renderRow={(c, i) => (
          <tr key={c.key} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
            <td className="px-1.5 py-1">{c.label}</td>
            <td className="px-1.5 py-1 text-right">{c.formatted}</td>
          </tr>
        )}
      />

      <p className="mb-1 mt-2 text-[7.5pt] font-bold uppercase tracking-wide text-gray-400">Productos más vendidos</p>
      <Table
        head={[{ label: 'Producto' }, { label: 'Cant.', align: 'right' }, { label: 'Subtotal', align: 'right' }]}
        rows={vm.topProducts}
        emptyLabel="Sin ventas de productos este día."
        renderRow={(p, i) => (
          <tr key={p.productId || p.name || i} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
            <td className="px-1.5 py-1">{p.name}</td>
            <td className="px-1.5 py-1 text-right">{p.quantity}</td>
            <td className="px-1.5 py-1 text-right">{p.formatted}</td>
          </tr>
        )}
      />
      {vm.voidedCount > 0 && (
        <p className="mt-1.5 text-[7.5pt] text-gray-500">
          {vm.voidedCount} venta{vm.voidedCount === 1 ? '' : 's'} anulada{vm.voidedCount === 1 ? '' : 's'} este día (no incluida{vm.voidedCount === 1 ? '' : 's'} arriba).
        </p>
      )}
    </section>
  );
}

function CollectionsSection({ vm }) {
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">2. Dinero recibido</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Pagos efectivamente recibidos este día, por medio</p>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : (
        <>
          <Table
            head={[{ label: 'Medio' }, { label: 'Monto', align: 'right' }]}
            rows={vm.byMethod}
            emptyLabel="Sin cobros registrados este día."
            renderRow={(m, i) => (
              <tr key={m.method} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
                <td className="px-1.5 py-1">{m.label}</td>
                <td className="px-1.5 py-1 text-right">{m.formatted}</td>
              </tr>
            )}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Kpi label="Total recibido" item={vm.total} tone="#15803D" />
          </div>
        </>
      )}
      {vm.pendingTodayAvailable ? (
        vm.pendingToday.value > 0 && (
          <p className="mt-1.5 text-[7.5pt] text-amber-700">Ventas de hoy pendientes de cobro: {vm.pendingToday.formatted}</p>
        )
      ) : (
        <p className="mt-1.5 text-[7.5pt] text-red-700">No pudimos calcular las ventas pendientes de cobro de este día.</p>
      )}
    </section>
  );
}

function ExpensesSection({ vm }) {
  if (!vm.available) {
    return (
      <section className="mb-3">
        <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">3. Gastos y egresos</h2>
        <Unavailable message={vm.message} />
      </section>
    );
  }
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">3. Gastos y egresos</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Gastos variables del día y otros movimientos de caja que no son gasto</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Kpi label="Gastos del día" item={vm.total} tone="#B91C1C" />
        <Kpi label="Otros egresos de caja" item={vm.cashOutflowsNonExpense} />
      </div>
      <Table
        head={[{ label: 'Categoría' }, { label: 'Monto', align: 'right' }]}
        rows={vm.byCategory}
        emptyLabel="Sin gastos registrados este día."
        renderRow={(c, i) => (
          <tr key={c.key} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
            <td className="px-1.5 py-1">{c.label}</td>
            <td className="px-1.5 py-1 text-right">{c.formatted}</td>
          </tr>
        )}
      />
      <p className="print-avoid-break mt-1.5 rounded bg-gray-50 px-2 py-1.5 text-[7.5pt] leading-tight text-gray-500">
        &quot;Otros egresos de caja&quot; (retiros, traslados) no está incluido en el total de gastos de arriba -- no son gasto y no se suman dos veces.
      </p>
    </section>
  );
}

function ProfitabilitySection({ vm }) {
  return (
    <section className="print-avoid-break mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">Saldo antes de costo de mercadería</h2>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : (
        <>
          <p className="text-[15pt] font-bold" style={{ color: vm.positive ? '#15803D' : vm.negative ? '#B91C1C' : '#475569' }}>
            {vm.positive ? '+' : ''}{vm.formatted}
          </p>
          <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[7.5pt] leading-tight text-amber-800">
            Ventas netas menos gastos registrados. No incluye el costo de los productos vendidos, por lo que no representa la ganancia del día.
          </p>
          <p className="mt-1 rounded bg-gray-50 px-2 py-1.5 text-[7.5pt] leading-tight text-gray-500">{vm.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function ReconciliationTable({ rows }) {
  return (
    <Table
      head={[{ label: 'Medio' }, { label: 'Esperado', align: 'right' }, { label: 'Conciliado', align: 'right' }, { label: 'Diferencia', align: 'right' }]}
      rows={rows}
      emptyLabel=""
      renderRow={(r, i) => (
        <tr key={r.id || r.method} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
          <td className="px-1.5 py-1">{r.label}</td>
          <td className="px-1.5 py-1 text-right">{r.expected.formatted}</td>
          <td className="px-1.5 py-1 text-right">{r.reconciled.formatted}</td>
          <td className="px-1.5 py-1 text-right" style={{ color: r.differenceSign > 0 ? '#15803D' : r.differenceSign < 0 ? '#B91C1C' : '#94A3B8' }}>
            {r.differenceSign > 0 ? '+' : ''}{r.difference.formatted}
          </td>
        </tr>
      )}
    />
  );
}

function CashSessionBlock({ session }) {
  return (
    <div className="print-avoid-break mb-2 rounded border border-gray-200 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[7pt] font-bold"
          style={session.status === 'open' ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F8FAFC', color: '#475569' }}
        >
          {session.status === 'open' ? 'Caja abierta' : 'Caja cerrada'}
        </span>
        <span className="text-[7.5pt] text-gray-400">
          Apertura {session.openedAtLabel}{session.closedAtLabel ? ` · Cierre ${session.closedAtLabel}` : ''}
        </span>
      </div>

      {session.message && <Unavailable message={session.message} />}

      {session.isLiveEstimate && session.liveEstimate && (
        <>
          <p className="mb-1 text-[7.5pt] font-semibold text-amber-700">
            Caja abierta — valores provisionales (estimado en vivo, no es un arqueo definitivo)
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Kpi label="Fondo inicial" item={session.liveEstimate.initialAmount} />
            <Kpi label="Cobros en efectivo" item={session.liveEstimate.cashReceived} tone="#15803D" />
            <Kpi label="Salidas en efectivo" item={session.liveEstimate.cashOutflow} tone="#B91C1C" />
            <Kpi label="Efectivo esperado en caja" item={session.liveEstimate.expectedCash} />
          </div>
          {session.liveEstimate.receivedByMethod.length > 0 && (
            <>
              <p className="mb-1 mt-1.5 text-[7.5pt] text-gray-400">Recibido por otros medios (no aumenta el efectivo físico)</p>
              <div className="flex flex-wrap gap-1.5">
                {session.liveEstimate.receivedByMethod.map(m => (
                  <Kpi key={m.method} label={m.label} item={m} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!session.isLiveEstimate && session.reconciliation && <ReconciliationTable rows={session.reconciliation} />}
      {!session.isLiveEstimate && session.noReconciliation && (
        <p className="py-1 text-[7.5pt] text-gray-400">Sin arqueo registrado para esta caja (cierre anterior al asistente de conciliación).</p>
      )}
    </div>
  );
}

function CashSection({ vm }) {
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">4. Caja y conciliación</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Puede haber más de una caja abierta/cerrada este día (cambios de turno)</p>
      {!vm.available ? (
        <Unavailable message={vm.message} />
      ) : vm.sessions.length === 0 ? (
        <p className="py-2 text-center text-[8pt] text-gray-400">No hubo caja abierta este día.</p>
      ) : (
        vm.sessions.map(session => <CashSessionBlock key={session.id} session={session} />)
      )}
    </section>
  );
}

function InventorySection({ vm }) {
  if (!vm.available) {
    return (
      <section className="mb-3">
        <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">5. Inventario</h2>
        <Unavailable message={vm.message} />
      </section>
    );
  }
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">5. Inventario</h2>
      <p className="mb-1.5 text-[7.5pt] text-gray-400">Movimientos de stock registrados este día</p>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <Kpi label="Entradas" item={{ formatted: String(vm.movementsSummary.entrada) }} />
        <Kpi label="Salidas" item={{ formatted: String(vm.movementsSummary.salida) }} />
        <Kpi label="Ajustes" item={{ formatted: String(vm.movementsSummary.ajuste) }} />
        <Kpi label="Bajo stock mínimo" item={{ formatted: String(vm.lowStockCount) }} tone={vm.lowStockCount > 0 ? '#B45309' : undefined} />
      </div>
      {!vm.isLowStockForToday && (
        <p className="text-[7.5pt] text-gray-500">&quot;Bajo stock mínimo&quot; refleja el stock actual, no el de esta fecha.</p>
      )}
      {vm.notableMovements.length > 0 && (
        <div className="mt-1.5">
          <Table
            head={[{ label: 'Producto' }, { label: 'Tipo' }, { label: 'Cant.', align: 'right' }, { label: 'Hora', align: 'right' }]}
            rows={vm.notableMovements}
            emptyLabel=""
            renderRow={(m, i) => (
              <tr key={i} className={`print-avoid-break border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
                <td className="px-1.5 py-1">{m.productName}</td>
                <td className="px-1.5 py-1">{m.typeLabel}</td>
                <td className="px-1.5 py-1 text-right">{m.quantity}</td>
                <td className="px-1.5 py-1 text-right">{m.createdAtLabel}</td>
              </tr>
            )}
          />
        </div>
      )}
    </section>
  );
}

function AlertsSection({ alerts }) {
  if (!alerts.length) return null;
  const tone = { warning: { bg: '#FEF9C3', color: '#B45309' }, info: { bg: '#DBEAFE', color: '#1D4ED8' }, error: { bg: '#FEE2E2', color: '#B91C1C' } };
  return (
    <section className="mb-3">
      <h2 className="print-heading mb-1 text-[10.5pt] font-bold text-[#1B2F4E]">6. Alertas</h2>
      {alerts.map((a, i) => {
        const t = tone[a.severity] || tone.info;
        return (
          <div key={i} className="print-avoid-break mb-1 rounded px-2 py-1 text-[8pt] leading-tight" style={{ backgroundColor: t.bg, color: t.color }}>
            {a.message}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Vista de impresión compacta del Resumen del día. Recibe `summary` ya
 * calculado (mismo objeto que ya tiene CrmResumenDia.jsx en memoria) -- NUNCA
 * llama a getDailySummary ni recalcula ningún total, solo arma el
 * view-model de presentación (idéntico al que usa el PDF) y lo renderiza en
 * HTML/CSS compacto para @media print.
 */
export default function CrmResumenDiaPrintView({ summary, business, date }) {
  const vm = buildResumenDiaPdfViewModel(
    summary,
    { businessName: business?.name, currency: business?.currency || 'CLP', logoUrl: business?.logoUrl || business?.logo_url || null },
    date,
  );

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
          <p className="text-[15pt] font-bold uppercase tracking-wide text-[#1B2F4E]">Resumen del día</p>
          <p className="text-[10pt] font-bold capitalize text-[#2563EB]">{vm.meta.dateLabel}</p>
          {vm.meta.generatedAtLabel && <p className="text-[7.5pt] text-gray-500">Generado el {vm.meta.generatedAtLabel} · Generado por Walinka</p>}
        </div>
      </div>

      {vm.meta.isToday === false && (
        <div className="print-avoid-break mb-2 rounded bg-amber-50 px-2 py-1.5 text-[7.5pt] leading-tight text-amber-800">
          Fecha histórica — algunos datos reflejan el estado actual, no el de ese día.
          {vm.meta.historicalLimitations.length > 0 ? ` ${vm.meta.historicalLimitations.join(' ')}` : ''}
        </div>
      )}

      <div className="print-avoid-break mb-3 flex flex-wrap gap-1.5">
        <HeadlineCard label="Ventas netas" item={vm.sales.available ? vm.sales.net : { formatted: null }} tone="#1D4ED8" />
        <HeadlineCard label="Dinero recibido" item={vm.collections.total} tone="#15803D" />
        <HeadlineCard label="Gastos" item={vm.expenses.available ? vm.expenses.total : { formatted: null }} tone="#B91C1C" />
        <HeadlineCard
          label="Saldo antes de costo de mercadería"
          item={vm.profitability.available ? vm.profitability : { formatted: null }}
          prefix={vm.profitability.available && vm.profitability.positive ? '+' : ''}
          tone={vm.profitability.available ? (vm.profitability.positive ? '#15803D' : vm.profitability.negative ? '#B91C1C' : '#475569') : undefined}
          disclaimer="No es la ganancia del día — no incluye costo de mercadería"
        />
      </div>

      <SalesSection vm={vm.sales} />
      <CollectionsSection vm={vm.collections} />
      <ExpensesSection vm={vm.expenses} />
      <ProfitabilitySection vm={vm.profitability} />
      <CashSection vm={vm.cash} />
      <InventorySection vm={vm.inventory} />
      <AlertsSection alerts={vm.alerts} />

      <div className="mt-2 flex justify-between border-t border-gray-200 pt-1.5 text-[7pt] text-gray-400">
        <span>{vm.meta.businessName || ''} · Resumen del día · {vm.meta.date}</span>
        <span>Generado por Walinka</span>
      </div>
    </div>
  );
}
