import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmInvoices, updateCrmInvoiceStatus, formatInvoiceNumber } from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';
import {
  KpiCard,
  FilterChip,
  DocSearchBar,
  DocStatusBadge,
  DocActionMenu,
  DocEmptyState,
  DocNoResults,
  DocListHeader,
} from '../../components/crm/DocListComponents';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-200/60',    bar: 'bg-amber-400' },
  parcial:   { label: 'Parcial',   dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 ring-orange-200/60', bar: 'bg-orange-400' },
  pagada:    { label: 'Pagada',    dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60', bar: 'bg-emerald-500' },
  anulada:   { label: 'Anulada',  dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 ring-red-200/60',           bar: 'bg-gray-300' },
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Invoice card ─────────────────────────────────────────────────────────────

function InvoiceCard({ inv, busy, fmt, onNavigate, onStatus }) {
  const pagado   = (inv.crm_payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const saldo    = (inv.total || 0) - pagado;
  const fullPaid = saldo <= 0 && pagado > 0;
  const partial  = saldo > 0 && pagado > 0;
  const cfg      = STATUS_CONFIG[inv.status] || { label: inv.status, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600 ring-gray-200/60', bar: 'bg-gray-200' };

  const paidDate = inv.paid_at ? fmtDate(inv.paid_at) : null;
  const issueDate = inv.issue_date ? fmtDate(`${inv.issue_date}T12:00:00`) : null;

  const menuItems = [
    { icon: 'Eye',      label: 'Ver factura',    onClick: onNavigate },
    { icon: 'FileText', label: 'Descargar PDF',  onClick: onNavigate },
    { type: 'divider' },
    { icon: 'Copy',     label: 'Duplicar',       soon: true },
    { icon: 'Share2',   label: 'Compartir',      soon: true },
    { icon: 'History',  label: 'Historial',      soon: true },
  ];
  if (inv.status === 'pendiente') {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'CheckCircle2', label: 'Marcar pagada', onClick: () => onStatus(inv.id, 'pagada'), green: true, disabled: !!busy });
    menuItems.push({ icon: 'XCircle',     label: 'Anular',         onClick: () => onStatus(inv.id, 'anulada'), red: true, disabled: !!busy });
  }

  return (
    <div
      onClick={onNavigate}
      className="group relative flex cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-px hover:border-gray-200 hover:shadow-md"
    >
      {/* Left color bar */}
      <div className={`w-1 shrink-0 self-stretch ${cfg.bar} transition-all group-hover:w-1.5`} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        {/* Col 1 — Identity */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-400">
            <Icon name="Receipt" size={17} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-bold tracking-tight text-gray-900">
                {formatInvoiceNumber(inv.invoice_number)}
              </span>
              <DocStatusBadge label={cfg.label} dot={cfg.dot} badge={cfg.badge} />
              {fullPaid && inv.status !== 'pagada' && (
                <DocStatusBadge label="Pagada" dot="bg-emerald-400" badge="bg-emerald-50 text-emerald-700 ring-emerald-200/60" />
              )}
              {partial && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
                  Pago parcial
                </span>
              )}
            </div>
            <p className="truncate text-xs">
              {inv.wa_customers?.name
                ? <span className="font-medium text-gray-600">{inv.wa_customers.name}</span>
                : <em className="text-gray-300">Sin cliente</em>}
            </p>
            {pagado > 0 && (
              <p className="mt-0.5 text-xs text-gray-400">
                Pagado: <span className="font-semibold text-emerald-600">{fmt(pagado)}</span>
                {saldo > 0 && <> · Saldo: <span className="font-semibold text-amber-600">{fmt(saldo)}</span></>}
              </p>
            )}
          </div>
        </div>

        {/* Col 2 — Dates */}
        <div className="hidden w-36 shrink-0 space-y-1.5 sm:block">
          {issueDate && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Emisión</p>
              <p className="text-xs font-medium text-gray-700">{issueDate}</p>
            </div>
          )}
          {paidDate && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pagada</p>
              <p className="text-xs font-semibold text-emerald-600">{paidDate}</p>
            </div>
          )}
        </div>

        {/* Col 3 — Amount */}
        <div className="shrink-0 text-right sm:w-28">
          <p className="text-xl font-black tracking-tight text-gray-900">{fmt(inv.total)}</p>
          {issueDate && <p className="mt-0.5 text-[10px] text-gray-400 sm:hidden">{issueDate}</p>}
        </div>

        {/* Col 4 — Actions */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onNavigate}
            className="hidden items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 sm:flex"
          >
            <Icon name="Eye" size={13} />
            Ver
          </button>
          <DocActionMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STATUS_FILTERS = ['pendiente', 'pagada', 'anulada'];
const FILTER_LABELS = {
  pendiente: { label: 'Pendientes', dot: STATUS_CONFIG.pendiente.dot },
  pagada:    { label: 'Pagadas',    dot: STATUS_CONFIG.pagada.dot },
  anulada:   { label: 'Anuladas',  dot: STATUS_CONFIG.anulada.dot },
};

export default function CrmInvoices() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [invoices, setInvoices]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmInvoices(business.id);
    setInvoices(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => formatMoney(n, business?.currency);

  // KPIs
  const kpis = useMemo(() => ({
    totalCobrado: invoices.filter(i => i.status === 'pagada').reduce((s, i) => s + (i.total || 0), 0),
    pagadas:      invoices.filter(i => i.status === 'pagada').length,
    pendientes:   invoices.filter(i => i.status === 'pendiente').length,
    anuladas:     invoices.filter(i => i.status === 'anulada').length,
  }), [invoices]);

  const counts = useMemo(() => ({
    all:       invoices.length,
    pendiente: invoices.filter(i => i.status === 'pendiente').length,
    pagada:    invoices.filter(i => i.status === 'pagada').length,
    anulada:   invoices.filter(i => i.status === 'anulada').length,
  }), [invoices]);

  const filtered = useMemo(() => invoices.filter(inv => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        formatInvoiceNumber(inv.invoice_number).toLowerCase().includes(q) ||
        (inv.wa_customers?.name || '').toLowerCase().includes(q) ||
        (inv.issue_date || '').includes(q)
      );
    }
    return true;
  }), [invoices, statusFilter, search]);

  const handleStatus = async (id, status) => {
    if (status === 'anulada' && !window.confirm('¿Anular esta factura? Esta acción no se puede deshacer.')) return;
    setBusy(id + status);
    await updateCrmInvoiceStatus(id, status);
    await load();
    setBusy('');
  };

  const noun = loading ? '…' : `${invoices.length} factura${invoices.length !== 1 ? 's' : ''}`;

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        {/* ── Header ── */}
        <div className="mb-6">
          <DocListHeader
            title="Facturas internas"
            count={invoices.length}
            noun={noun}
            ctaLabel="Nueva factura"
            ctaIcon="PlusCircle"
            onCta={() => navigate('/crm/facturas/nueva')}
            loading={loading}
          />

          {/* KPIs */}
          {!loading && invoices.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                icon="TrendingUp"
                label="Total cobrado"
                value={fmt(kpis.totalCobrado)}
                color="green"
              />
              <KpiCard
                icon="CheckCircle2"
                label="Pagadas"
                value={kpis.pagadas}
                color="green"
                active={statusFilter === 'pagada'}
                onClick={() => setStatusFilter(f => f === 'pagada' ? null : 'pagada')}
              />
              <KpiCard
                icon="Clock"
                label="Pendientes"
                value={kpis.pendientes}
                color="amber"
                active={statusFilter === 'pendiente'}
                onClick={() => setStatusFilter(f => f === 'pendiente' ? null : 'pendiente')}
                sub={kpis.pendientes > 0 ? 'Por cobrar' : null}
              />
              <KpiCard
                icon="XCircle"
                label="Anuladas"
                value={kpis.anuladas}
                color="gray"
                active={statusFilter === 'anulada'}
                onClick={() => setStatusFilter(f => f === 'anulada' ? null : 'anulada')}
              />
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        {!loading && invoices.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="Todas"
                count={counts.all}
                active={statusFilter === null}
                onClick={() => setStatusFilter(null)}
              />
              {STATUS_FILTERS.map(s => (
                <FilterChip
                  key={s}
                  label={FILTER_LABELS[s].label}
                  count={counts[s] || 0}
                  active={statusFilter === s}
                  dot={FILTER_LABELS[s].dot}
                  onClick={() => setStatusFilter(f => f === s ? null : s)}
                />
              ))}
            </div>
            <DocSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Número, cliente o fecha…"
            />
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Icon name="Loader2" size={28} className="animate-spin text-blue-500" />
          </div>
        ) : invoices.length === 0 ? (
          <DocEmptyState
            icon="Receipt"
            title="Sin facturas todavía"
            description="Crea tu primera factura interna para comenzar."
            action={() => navigate('/crm/facturas/nueva')}
            actionLabel="Crear primera factura"
          />
        ) : filtered.length === 0 ? (
          <DocNoResults
            search={search}
            onClear={() => { setSearch(''); setStatusFilter(null); }}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(inv => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                busy={busy}
                fmt={fmt}
                onNavigate={() => navigate(`/crm/facturas/${inv.id}`)}
                onStatus={handleStatus}
              />
            ))}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
