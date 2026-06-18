import React, { useEffect, useState, useMemo } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getRankingData } from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getPeriodRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'day') {
    const today = fmt(now);
    return { start: today, end: today };
  }
  if (period === 'month') {
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    return { start, end: fmt(now) };
  }
  // year
  return { start: `${now.getFullYear()}-01-01`, end: fmt(now) };
}

function getPrevPeriodRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'day') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = fmt(yesterday);
    return { start: d, end: d };
  }
  if (period === 'month') {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(prevMonth), end: fmt(lastDay) };
  }
  // year
  const prevYear = now.getFullYear() - 1;
  return { start: `${prevYear}-01-01`, end: `${prevYear}-12-31` };
}

function dayLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function computeStats(invoices, items) {
  const totalRevenue = invoices.reduce((s, inv) => s + parseFloat(inv.total || 0), 0);
  const count = invoices.length;
  const avgTicket = count > 0 ? totalRevenue / count : 0;

  // Best day
  const byDay = {};
  for (const inv of invoices) {
    const d = inv.issue_date;
    byDay[d] = (byDay[d] || 0) + parseFloat(inv.total || 0);
  }
  const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || null;

  // Top customers by amount
  const byCustomer = {};
  for (const inv of invoices) {
    const cid = inv.customer_id || '__sin_cliente__';
    const name = inv.wa_customers?.company || inv.wa_customers?.name || 'Sin cliente';
    if (!byCustomer[cid]) byCustomer[cid] = { name, total: 0, count: 0 };
    byCustomer[cid].total += parseFloat(inv.total || 0);
    byCustomer[cid].count += 1;
  }
  const topCustomers = Object.values(byCustomer)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Top products by quantity and by revenue
  const byProduct = {};
  for (const item of items) {
    const key = item.product_id || item.name;
    if (!byProduct[key]) byProduct[key] = { name: item.name, qty: 0, revenue: 0 };
    byProduct[key].qty += parseInt(item.quantity || 0, 10);
    byProduct[key].revenue += parseFloat(item.subtotal || 0);
  }
  const allProducts = Object.values(byProduct);
  const topByQty = [...allProducts].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topByRevenue = [...allProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  return { totalRevenue, count, avgTicket, bestDay, topCustomers, topByQty, topByRevenue };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'text-emerald-600' }) {
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className={`mt-0.5 shrink-0 ${color}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs mb-0.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>{label}</p>
        <p className="text-lg font-bold leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function RankTable({ title, icon, rows, colA, colB, colC, noDataMsg }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Icon name={icon} size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{title}</h3>
        </div>
        <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>{noDataMsg}</p>
      </div>
    );
  }
  const maxVal = rows[0]?.[colC.key] || 1;
  return (
    <div className="rounded-xl p-5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon name={icon} size={16} style={{ color: 'var(--color-text-secondary)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{title}</h3>
      </div>
      <div className="space-y-2.5">
        {rows.map((row, i) => {
          const pct = Math.round((row[colC.key] / maxVal) * 100);
          return (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs font-bold w-5 text-center shrink-0"
                    style={{ color: i < 3 ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                  >{i + 1}</span>
                  <span className="text-sm truncate" style={{ color: 'var(--color-foreground)' }}>{row[colA.key]}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {colB && (
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{colB.format(row[colB.key])}</span>
                  )}
                  <span className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>{colC.format(row[colC.key])}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'var(--color-primary)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: 'day',   label: 'Hoy' },
  { value: 'month', label: 'Este mes' },
  { value: 'year',  label: 'Este año' },
];

export default function CrmRanking() {
  const { business } = useAuth();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ invoices: [], items: [] });
  const [prevData, setPrevData] = useState({ invoices: [], items: [] });

  useEffect(() => {
    if (!business?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { start, end } = getPeriodRange(period);
    const { start: pStart, end: pEnd } = getPrevPeriodRange(period);

    Promise.all([
      getRankingData(business.id, start, end),
      getRankingData(business.id, pStart, pEnd),
    ]).then(([curr, prev]) => {
      if (cancelled) return;
      if (curr.error) { setError(curr.error.message || 'Error al cargar datos.'); setLoading(false); return; }
      setData({ invoices: curr.invoices, items: curr.items });
      setPrevData({ invoices: prev.invoices, items: prev.items });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [business?.id, period]);

  const stats = useMemo(() => computeStats(data.invoices, data.items), [data]);
  const prevStats = useMemo(() => computeStats(prevData.invoices, prevData.items), [prevData]);

  const currency = business?.currency || 'CLP';

  const fmt = v => formatMoney(v, currency);

  const pctChange = (curr, prev) => {
    if (!prev) return null;
    const diff = ((curr - prev) / prev) * 100;
    return diff;
  };

  const diffRevenue = pctChange(stats.totalRevenue, prevStats.totalRevenue);
  const diffCount = pctChange(stats.count, prevStats.count);

  const prevLabel = period === 'day' ? 'ayer' : period === 'month' ? 'mes anterior' : 'año anterior';

  const isEmpty = !loading && data.invoices.length === 0;

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader title="Ranking de ventas" />
        <CrmBreadcrumb items={[{ label: 'CRM', path: '/crm' }, { label: 'Ranking de ventas' }]} />

        {/* Period tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'var(--color-border)' }}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
              style={period === p.value
                ? { background: 'var(--color-surface)', color: 'var(--color-foreground)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
                : { color: 'var(--color-text-secondary)', background: 'transparent' }
              }
            >{p.label}</button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl p-5 text-sm" style={{ border: '1px solid var(--color-border)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {isEmpty && !error && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            <Icon name="BarChart2" size={36} className="mx-auto mb-3" style={{ color: 'var(--color-text-secondary)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>Aún no hay ventas para calcular ranking</p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Registra notas de venta pagadas para ver tus estadísticas.
            </p>
          </div>
        )}

        {!loading && !error && !isEmpty && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon="TrendingUp"
                label="Total vendido"
                value={fmt(stats.totalRevenue)}
                sub={diffRevenue !== null ? `${diffRevenue >= 0 ? '+' : ''}${diffRevenue.toFixed(1)}% vs ${prevLabel}` : undefined}
                color="text-emerald-600"
              />
              <StatCard
                icon="ShoppingCart"
                label="Cantidad de ventas"
                value={stats.count}
                sub={diffCount !== null ? `${diffCount >= 0 ? '+' : ''}${diffCount.toFixed(1)}% vs ${prevLabel}` : undefined}
                color="text-blue-500"
              />
              <StatCard
                icon="Receipt"
                label="Ticket promedio"
                value={fmt(stats.avgTicket)}
                color="text-purple-500"
              />
              <StatCard
                icon="Calendar"
                label="Mejor día"
                value={stats.bestDay ? fmt(stats.bestDay[1]) : '—'}
                sub={stats.bestDay ? dayLabel(stats.bestDay[0]) : undefined}
                color="text-amber-500"
              />
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RankTable
                title="Top productos por cantidad"
                icon="Package"
                rows={stats.topByQty}
                colA={{ key: 'name' }}
                colB={{ key: 'revenue', format: v => fmt(v) }}
                colC={{ key: 'qty', format: v => `${v} uds.` }}
                noDataMsg="Sin datos de productos"
              />
              <RankTable
                title="Top productos por facturación"
                icon="DollarSign"
                rows={stats.topByRevenue}
                colA={{ key: 'name' }}
                colB={{ key: 'qty', format: v => `${v} uds.` }}
                colC={{ key: 'revenue', format: v => fmt(v) }}
                noDataMsg="Sin datos de productos"
              />
            </div>

            <RankTable
              title="Top clientes por monto comprado"
              icon="Users"
              rows={stats.topCustomers}
              colA={{ key: 'name' }}
              colB={{ key: 'count', format: v => `${v} ventas` }}
              colC={{ key: 'total', format: v => fmt(v) }}
              noDataMsg="Sin datos de clientes"
            />
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
