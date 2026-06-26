import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmInvoices, updateCrmInvoiceStatus, formatInvoiceNumber } from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 ring-amber-200/60' },
  parcial:   { label: 'Parcial',   dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 ring-orange-200/60' },
  pagada:    { label: 'Pagada',    dot: 'bg-emerald-400',badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' },
  anulada:   { label: 'Anulada',   dot: 'bg-red-400',    badge: 'bg-red-50 text-red-600 ring-red-200/60' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600 ring-gray-200/60' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function ActionMenu({ inv, busy, onNavigate, onStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Más acciones"
      >
        <Icon name="MoreHorizontal" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-48 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl shadow-gray-200/80">
          <MenuItem icon="Eye" label="Ver factura" onClick={() => { setOpen(false); onNavigate(); }} />
          <MenuItem icon="FileText" label="Descargar PDF" onClick={() => { setOpen(false); onNavigate(); }} />
          <div className="my-1 border-t border-gray-100" />
          <MenuItem icon="Copy" label="Duplicar" onClick={() => setOpen(false)} muted />
          <MenuItem icon="Share2" label="Compartir" onClick={() => setOpen(false)} muted />
          <MenuItem icon="History" label="Historial" onClick={() => setOpen(false)} muted />
          {inv.status === 'pendiente' && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <MenuItem
                icon="CheckCircle2"
                label="Marcar pagada"
                onClick={() => { setOpen(false); onStatus(inv.id, 'pagada'); }}
                green
                disabled={!!busy}
              />
              <MenuItem
                icon="XCircle"
                label="Anular"
                onClick={() => { setOpen(false); onStatus(inv.id, 'anulada'); }}
                red
                disabled={!!busy}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, muted, green, red, disabled }) {
  const color = red
    ? 'text-red-600 hover:bg-red-50'
    : green
      ? 'text-emerald-700 hover:bg-emerald-50'
      : muted
        ? 'text-gray-400 hover:bg-gray-50 cursor-not-allowed'
        : 'text-gray-700 hover:bg-gray-50';
  return (
    <button
      type="button"
      onClick={disabled || muted ? undefined : onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-medium disabled:opacity-40 ${color}`}
    >
      <Icon name={icon} size={13} />
      {label}
      {muted && <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">PRONTO</span>}
    </button>
  );
}

// ─── Invoice card ─────────────────────────────────────────────────────────────

function InvoiceCard({ inv, busy, fmt, onNavigate, onStatus }) {
  const pagado   = (inv.crm_payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const saldo    = (inv.total || 0) - pagado;
  const fullPaid = saldo <= 0 && pagado > 0;
  const partial  = saldo > 0 && pagado > 0;

  const issueDate = inv.issue_date
    ? new Date(`${inv.issue_date}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const paidDate = inv.paid_at
    ? new Date(inv.paid_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      onClick={onNavigate}
      className="group relative flex cursor-pointer flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-px hover:border-gray-200 hover:shadow-md sm:flex-row sm:items-center"
    >
      {/* Col 1 — Identity */}
      <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
          <Icon name="FileText" size={18} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold tracking-tight text-gray-900">
              {formatInvoiceNumber(inv.invoice_number)}
            </span>
            <StatusBadge status={inv.status} />
            {fullPaid && inv.status !== 'pagada' && <StatusBadge status="pagada" />}
            {partial && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
                Pago parcial
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-400">
            {inv.wa_customers?.name || <em>Sin cliente</em>}
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
      <div className="hidden shrink-0 space-y-1.5 sm:block sm:w-36">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Emisión</p>
          <p className="text-xs font-medium text-gray-700">{issueDate}</p>
        </div>
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
        <p className="mt-0.5 text-[10px] text-gray-400 sm:hidden">{issueDate}</p>
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
        <ActionMenu
          inv={inv}
          busy={busy}
          onNavigate={onNavigate}
          onStatus={onStatus}
        />
      </div>
    </div>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? 'bg-gray-900 text-white shadow-sm'
          : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300'
      }`}
    >
      {dot && !active && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STATUS_FILTERS = ['pendiente', 'pagada', 'anulada'];

export default function CrmInvoices() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [invoices, setInvoices]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState('');
  const [search, setSearch]           = useState('');
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

  const counts = {
    all:      invoices.length,
    pendiente: invoices.filter(i => i.status === 'pendiente').length,
    pagada:    invoices.filter(i => i.status === 'pagada').length,
    anulada:   invoices.filter(i => i.status === 'anulada').length,
  };

  const filtered = invoices.filter(inv => {
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
  });

  const handleStatus = async (id, status) => {
    if (status === 'anulada' && !window.confirm('¿Anular esta factura? Esta acción no se puede deshacer.')) return;
    setBusy(id + status);
    await updateCrmInvoiceStatus(id, status);
    await load();
    setBusy('');
  };

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        {/* ── Page header ── */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">Facturas internas</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              {loading ? 'Cargando…' : `${invoices.length} documento${invoices.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => navigate('/crm/facturas/nueva')}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            <Icon name="PlusCircle" size={16} />
            Nueva factura
          </button>
        </div>

        {/* ── Toolbar ── */}
        {!loading && invoices.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Filter chips */}
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
                  label={STATUS_CONFIG[s]?.label || s}
                  count={counts[s] || 0}
                  active={statusFilter === s}
                  dot={STATUS_CONFIG[s]?.dot}
                  onClick={() => setStatusFilter(prev => prev === s ? null : s)}
                />
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Número, cliente o fecha…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <Icon name="X" size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── States ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Icon name="Loader2" size={28} className="animate-spin text-blue-500" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Icon name="FileText" size={28} className="text-blue-400" />
            </div>
            <h3 className="text-base font-bold text-gray-800">Sin facturas todavía</h3>
            <p className="mt-1 text-sm text-gray-400">Crea tu primera factura interna para comenzar.</p>
            <button
              onClick={() => navigate('/crm/facturas/nueva')}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Icon name="PlusCircle" size={15} />
              Crear primera factura
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
              <Icon name="SearchX" size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
            <p className="mt-1 text-xs text-gray-400">
              {search ? `No hay documentos para "${search}".` : 'No hay documentos con este filtro.'}
            </p>
            <button
              onClick={() => { setSearch(''); setStatusFilter(null); }}
              className="mt-3 text-sm font-medium text-blue-600 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
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
