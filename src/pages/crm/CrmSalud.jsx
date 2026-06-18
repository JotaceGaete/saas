import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmSalesTotalsForPeriod,
  getCostCenter,
  getCostItems,
  getPurchaseTotalsForPeriod,
  getBusinessCreditSummary,
  getCrmDashboardStats,
  getRankingData,
} from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';

// ─── helpers ─────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function getState(salesToday, dailyCost) {
  if (dailyCost <= 0) return 'unconfigured';
  if (salesToday >= dailyCost) return 'winning';
  if (salesToday >= dailyCost * 0.75) return 'breaking';
  return 'losing';
}

const STATE_META = {
  winning:      { label: 'En positivo',        color: '#059669', bg: '#d1fae5', icon: 'TrendingUp' },
  breaking:     { label: 'Punto de equilibrio', color: '#d97706', bg: '#fef3c7', icon: 'Minus' },
  losing:       { label: 'En negativo',         color: '#dc2626', bg: '#fee2e2', icon: 'TrendingDown' },
  unconfigured: { label: 'Sin configurar',      color: '#6b7280', bg: '#f3f4f6', icon: 'Settings' },
};

// ─── sub-components ───────────────────────────────────────────────────────────

function SemaforoCard({ state, salesToday, dailyCost, currency }) {
  const meta = STATE_META[state];
  const pct = dailyCost > 0 ? Math.min(100, Math.round((salesToday / dailyCost) * 100)) : 0;
  const fmt = v => formatMoney(v, currency);

  return (
    <div
      className="rounded-xl p-5 col-span-2"
      style={{ border: `1px solid ${meta.color}30`, background: meta.bg }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="mt-0.5 shrink-0" style={{ color: meta.color }}>
          <Icon name={meta.icon} size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium mb-0.5" style={{ color: meta.color }}>Semáforo del negocio — hoy</p>
          <p className="text-lg font-bold" style={{ color: meta.color, fontFamily: 'var(--font-heading)' }}>
            {meta.label}
          </p>
        </div>
      </div>

      {state === 'unconfigured' ? (
        <p className="text-xs" style={{ color: '#6b7280' }}>
          Configura tus costos fijos en{' '}
          <a href="/crm/cost-center" className="underline font-medium">Centro de costos</a>{' '}
          para ver el semáforo.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: meta.color }}>
            <span>Ventas hoy: <strong>{fmt(salesToday)}</strong></span>
            <span>Meta diaria: <strong>{fmt(dailyCost)}</strong></span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: `${meta.color}30` }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: meta.color }}
            />
          </div>
          <p className="text-xs mt-1.5 text-right" style={{ color: meta.color }}>{pct}% de la meta</p>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color, href, navigate }) {
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      onClick={() => href && navigate(href)}
    >
      <div className="mt-0.5 shrink-0" style={{ color: color || 'var(--color-primary)' }}>
        <Icon name={icon} size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs mb-0.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>{label}</p>
        <p className="text-base font-bold leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>}
      </div>
      {href && <Icon name="ChevronRight" size={14} className="ml-auto shrink-0 self-center" style={{ color: 'var(--color-text-secondary)' }} />}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <h2 className="text-sm font-semibold mt-6 mb-3" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
      {title}
    </h2>
  );
}

function TopProductCard({ product, currency }) {
  if (!product) return null;
  const fmt = v => formatMoney(v, currency);
  return (
    <div
      className="rounded-xl p-4 col-span-2"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon name="Star" size={16} style={{ color: '#f59e0b' }} />
        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Producto más vendido del mes</p>
      </div>
      <p className="text-sm font-bold truncate mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
        {product.name}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {product.qty} unidades · {fmt(product.revenue)} facturados
      </p>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function CrmSalud() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const today = `${year}-${pad(month)}-${pad(now.getDate())}`;
      const monthStart = `${year}-${pad(month)}-01`;

      try {
        const [
          salesTotals,
          costCenter,
          costItems,
          purchaseTotals,
          creditSummary,
          dashStats,
          rankingData,
        ] = await Promise.all([
          getCrmSalesTotalsForPeriod(business.id, month, year),
          getCostCenter(business.id, month, year),
          getCostItems(business.id, month, year),
          getPurchaseTotalsForPeriod(business.id, month, year),
          getBusinessCreditSummary(business.id),
          getCrmDashboardStats(business.id),
          getRankingData(business.id, monthStart, today),
        ]);

        if (cancelled) return;

        // Semáforo
        const openDays = costCenter?.open_days ?? 22;
        const totalFijos = (costItems || []).reduce((s, i) => s + (i.amount || 0), 0);
        const totalOperacional = purchaseTotals?.totalOperational || 0;
        const totalMes = totalFijos + totalOperacional;
        const dailyCost = openDays > 0 && totalMes > 0 ? totalMes / openDays : 0;
        const semaforo = getState(salesTotals.salesToday, dailyCost);

        // Cobertura mensual
        const covPct = totalMes > 0
          ? Math.min(100, Math.round((salesTotals.salesMonth / totalMes) * 100))
          : null;

        // Ticket promedio del mes
        const invoiceCount = dashStats.recentInvoices?.length ?? 0;
        // Use ranking invoices for accurate count this month
        const rankInvoices = rankingData.invoices || [];
        const rankCount = rankInvoices.length;
        const rankTotal = rankInvoices.reduce((s, i) => s + parseFloat(i.total || 0), 0);
        const avgTicket = rankCount > 0 ? rankTotal / rankCount : 0;

        // Top producto por cantidad
        const byProduct = {};
        for (const item of rankingData.items || []) {
          const key = item.product_id || item.name;
          if (!byProduct[key]) byProduct[key] = { name: item.name, qty: 0, revenue: 0 };
          byProduct[key].qty += parseInt(item.quantity || 0, 10);
          byProduct[key].revenue += parseFloat(item.subtotal || 0);
        }
        const topProduct = Object.values(byProduct).sort((a, b) => b.qty - a.qty)[0] || null;

        setSnapshot({
          semaforo,
          salesToday: salesTotals.salesToday,
          salesMonth: salesTotals.salesMonth,
          dailyCost,
          totalMes,
          covPct,
          totalFijos,
          totalOperacional,
          clientesConDeuda: creditSummary?.clientesConDeuda ?? 0,
          totalPorCobrar: creditSummary?.totalPorCobrar ?? 0,
          stockCritico: dashStats.stockBajo?.length ?? 0,
          rankCount,
          avgTicket,
          topProduct,
          costoConfigurado: totalMes > 0,
        });
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Error al cargar salud del negocio.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [business?.id]);

  const currency = business?.currency || 'CLP';
  const fmt = v => formatMoney(v, currency);

  const noSales = !loading && snapshot && snapshot.rankCount === 0 && !snapshot.costoConfigurado;

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader title="Salud del negocio" />
        <CrmBreadcrumb items={[{ label: 'CRM', path: '/crm' }, { label: 'Salud del negocio' }]} />

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
            />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl p-5 text-sm" style={{ border: '1px solid var(--color-border)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {noSales && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            <Icon name="Activity" size={36} className="mx-auto mb-3" style={{ color: 'var(--color-text-secondary)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
              Aún no hay ventas para calcular la salud del negocio
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Registra ventas pagadas y configura tus costos fijos para ver el diagnóstico completo.
            </p>
          </div>
        )}

        {!loading && !error && snapshot && !noSales && (
          <div>
            {/* Semáforo */}
            <SectionTitle title="Situación de hoy" />
            <div className="grid grid-cols-2 gap-3">
              <SemaforoCard
                state={snapshot.semaforo}
                salesToday={snapshot.salesToday}
                dailyCost={snapshot.dailyCost}
                currency={currency}
              />
            </div>

            {/* Ventas del mes */}
            <SectionTitle title="Ventas del mes" />
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                icon="TrendingUp"
                label="Total facturado"
                value={fmt(snapshot.salesMonth)}
                sub={snapshot.rankCount > 0 ? `${snapshot.rankCount} ventas pagadas` : 'Solo pagadas'}
                color="#059669"
                href="/crm/facturas"
                navigate={navigate}
              />
              <KpiCard
                icon="Receipt"
                label="Ticket promedio"
                value={snapshot.avgTicket > 0 ? fmt(snapshot.avgTicket) : '—'}
                sub="Ventas pagadas del mes"
                color="#7c3aed"
              />
              {snapshot.costoConfigurado && snapshot.covPct !== null && (
                <div
                  className="rounded-xl p-4 col-span-2"
                  style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span style={{ color: 'var(--color-text-secondary)' }}>Cobertura de costos</span>
                    <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{snapshot.covPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${snapshot.covPct}%`,
                        background: snapshot.covPct >= 100 ? '#059669' : snapshot.covPct >= 75 ? '#d97706' : '#dc2626',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>Ventas: {fmt(snapshot.salesMonth)}</span>
                    <span>Costos: {fmt(snapshot.totalMes)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Top producto */}
            {snapshot.topProduct && (
              <>
                <SectionTitle title="Rendimiento de productos" />
                <div className="grid grid-cols-2 gap-3">
                  <TopProductCard product={snapshot.topProduct} currency={currency} />
                  <KpiCard
                    icon="BarChart2"
                    label="Ver ranking completo"
                    value="Top productos"
                    sub="Cantidad y facturación"
                    color="#0ea5e9"
                    href="/crm/ranking"
                    navigate={navigate}
                  />
                </div>
              </>
            )}

            {/* Alertas */}
            <SectionTitle title="Alertas" />
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                icon="AlertTriangle"
                label="Stock crítico"
                value={snapshot.stockCritico > 0 ? `${snapshot.stockCritico} producto${snapshot.stockCritico !== 1 ? 's' : ''}` : 'Todo en orden'}
                sub={snapshot.stockCritico > 0 ? 'Bajo mínimo o agotado' : 'Sin alertas de stock'}
                color={snapshot.stockCritico > 0 ? '#dc2626' : '#059669'}
                href="/crm/stock"
                navigate={navigate}
              />
              <KpiCard
                icon="Clock"
                label="Clientes con deuda"
                value={snapshot.clientesConDeuda > 0 ? `${snapshot.clientesConDeuda} cliente${snapshot.clientesConDeuda !== 1 ? 's' : ''}` : 'Sin deudas'}
                sub={snapshot.clientesConDeuda > 0 ? `${fmt(snapshot.totalPorCobrar)} por cobrar` : 'Cuentas al día'}
                color={snapshot.clientesConDeuda > 0 ? '#d97706' : '#059669'}
                href="/crm/clientes"
                navigate={navigate}
              />
            </div>

            {/* Costos del mes — solo si están configurados */}
            {snapshot.costoConfigurado && (
              <>
                <SectionTitle title="Costos del mes" />
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard
                    icon="Building2"
                    label="Costos fijos"
                    value={fmt(snapshot.totalFijos)}
                    sub="Configurados en Centro de Costos"
                    color="#6b7280"
                    href="/crm/cost-center"
                    navigate={navigate}
                  />
                  <KpiCard
                    icon="ShoppingBag"
                    label="Gastos operacionales"
                    value={fmt(snapshot.totalOperacional)}
                    sub="Compras del mes"
                    color="#6b7280"
                    href="/crm/compras"
                    navigate={navigate}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
