import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmQuotes,
  updateCrmQuote,
  duplicateCrmQuote,
  convertQuoteToInvoice,
  formatQuoteNumber,
  getQuoteDocLabel,
} from '../../services/crmService';
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
  getDaysUntil,
  ExpiryPill,
} from '../../components/crm/DocListComponents';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  borrador:  { label: 'Borrador',  dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 ring-gray-200/60',    bar: 'bg-gray-200' },
  enviado:   { label: 'Enviado',   dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 ring-blue-200/60',    bar: 'bg-blue-400' },
  aceptado:  { label: 'Aceptado', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60', bar: 'bg-emerald-500' },
  rechazado: { label: 'Rechazado', dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 ring-red-200/60',       bar: 'bg-gray-300' },
};

function getBarColor(q) {
  if (q.converted_to_invoice_id) return 'bg-violet-400';
  if (q.status === 'aceptado') return STATUS_CONFIG.aceptado.bar;
  if (q.status === 'rechazado') return STATUS_CONFIG.rechazado.bar;
  const days = getDaysUntil(q.valid_until);
  if (days !== null && days < 0) return 'bg-red-400';
  if (days !== null && days <= 7) return 'bg-amber-400';
  return STATUS_CONFIG[q.status]?.bar || 'bg-gray-200';
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EDITABLE_QUOTE_STATUSES = new Set(['borrador', 'enviado', 'pendiente']);

// ─── Quote card ───────────────────────────────────────────────────────────────

function QuoteCard({ q, busy, fmt, docLabel, onNavigate, onStatus, onDuplicate, onConvert }) {
  const canEdit    = EDITABLE_QUOTE_STATUSES.has(q.status) && !q.converted_to_invoice_id;
  const isConverted = !!q.converted_to_invoice_id;
  const cfg        = STATUS_CONFIG[q.status] || STATUS_CONFIG.borrador;
  const barColor   = getBarColor(q);
  const days       = getDaysUntil(q.valid_until);
  const isExpired  = days !== null && days < 0 && !['aceptado','rechazado'].includes(q.status);

  const menuItems = [
    { icon: 'Eye',      label: 'Ver presupuesto', onClick: onNavigate },
    { icon: 'FileText', label: 'Ver PDF',          onClick: onNavigate },
    { type: 'divider' },
    { icon: 'Copy',     label: 'Duplicar',         onClick: onDuplicate, disabled: !!busy },
    { icon: 'Send',     label: 'Enviar',            soon: true },
    { icon: 'Share2',   label: 'Compartir',         soon: true },
    { icon: 'History',  label: 'Historial',         soon: true },
  ];

  if (q.status === 'borrador') {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'Send',      label: 'Marcar enviado',  onClick: () => onStatus(q.id, 'enviado'),   disabled: !!busy });
  }
  if (q.status === 'enviado') {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'ThumbsUp',   label: 'Marcar aceptado',  onClick: () => onStatus(q.id, 'aceptado'),  green: true, disabled: !!busy });
    menuItems.push({ icon: 'ThumbsDown', label: 'Marcar rechazado', onClick: () => onStatus(q.id, 'rechazado'), red:   true, disabled: !!busy });
  }
  if (q.status === 'aceptado' && !isConverted) {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'ArrowRightCircle', label: 'Convertir a factura', onClick: () => onConvert(q), green: true, disabled: !!busy });
  }

  return (
    <div
      onClick={onNavigate}
      className="group relative flex cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-px hover:border-gray-200 hover:shadow-md"
    >
      {/* Left color bar */}
      <div className={`w-1 shrink-0 self-stretch ${barColor} transition-all group-hover:w-1.5`} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        {/* Col 1 — Identity */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-400">
            <Icon name="FileText" size={17} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-bold tracking-tight text-gray-900">
                {formatQuoteNumber(q.quote_number, q._docTitleType)}
              </span>
              <DocStatusBadge
                label={isExpired ? 'Vencido' : (cfg.label)}
                dot={isExpired ? 'bg-red-400' : cfg.dot}
                badge={isExpired ? 'bg-red-50 text-red-600 ring-red-200/60' : cfg.badge}
              />
              {isConverted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200/60">
                  <Icon name="ArrowRightCircle" size={10} />
                  Convertido
                </span>
              )}
            </div>
            <p className="truncate text-xs text-gray-400">
              {q.wa_customers?.name
                ? <span className="font-medium text-gray-600">{q.wa_customers.name}</span>
                : <em className="text-gray-300">Sin cliente</em>}
              {q.wa_customers?.company && (
                <span className="text-gray-400"> · {q.wa_customers.company}</span>
              )}
            </p>
            {days !== null && !['aceptado','rechazado'].includes(q.status) && !isConverted && (
              <div className="mt-1">
                <ExpiryPill days={days} />
              </div>
            )}
          </div>
        </div>

        {/* Col 2 — Dates (hidden on mobile) */}
        <div className="hidden w-36 shrink-0 space-y-1.5 sm:block">
          {q.created_at && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Emisión</p>
              <p className="text-xs font-medium text-gray-700">{fmtDate(q.created_at?.slice(0,10))}</p>
            </div>
          )}
          {q.valid_until && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vencimiento</p>
              <p className={`text-xs font-medium ${isExpired ? 'font-semibold text-red-500' : days !== null && days <= 7 ? 'font-semibold text-amber-600' : 'text-gray-700'}`}>
                {fmtDate(q.valid_until)}
              </p>
            </div>
          )}
        </div>

        {/* Col 3 — Amount */}
        <div className="shrink-0 text-right sm:w-28">
          <p className="text-xl font-black tracking-tight text-gray-900">{fmt(q.total)}</p>
          {q.valid_until && (
            <p className="mt-0.5 text-[10px] text-gray-400 sm:hidden">
              {isExpired ? `Venció ${fmtDate(q.valid_until)}` : `Vence ${fmtDate(q.valid_until)}`}
            </p>
          )}
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

const FILTER_KEYS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'por_vencer'];

function computeVirtual(q) {
  const days = getDaysUntil(q.valid_until);
  const active = !['aceptado','rechazado'].includes(q.status);
  if (active && days !== null && days < 0)  return 'vencido';
  if (active && days !== null && days <= 7) return 'por_vencer';
  return q.status;
}

export default function CrmQuotes() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [quotes, setQuotes]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState('');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmQuotes(business.id);
    setQuotes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt      = (n) => formatMoney(n, business?.currency);
  const docLabel = getQuoteDocLabel(business?.documentTitleType);

  // KPIs
  const kpis = useMemo(() => {
    const active = quotes.filter(q => q.status !== 'rechazado');
    return {
      totalCotizado:  active.reduce((s, q) => s + (q.total || 0), 0),
      aceptados:      quotes.filter(q => q.status === 'aceptado').length,
      pendientes:     quotes.filter(q => ['borrador','enviado'].includes(q.status)).length,
      vencidos:       quotes.filter(q => computeVirtual(q) === 'vencido').length,
    };
  }, [quotes]);

  // Counts per filter
  const counts = useMemo(() => ({
    all:        quotes.length,
    borrador:   quotes.filter(q => q.status === 'borrador').length,
    enviado:    quotes.filter(q => q.status === 'enviado').length,
    aceptado:   quotes.filter(q => q.status === 'aceptado').length,
    rechazado:  quotes.filter(q => q.status === 'rechazado').length,
    vencido:    quotes.filter(q => computeVirtual(q) === 'vencido').length,
    por_vencer: quotes.filter(q => computeVirtual(q) === 'por_vencer').length,
  }), [quotes]);

  const filtered = useMemo(() => quotes.filter(q => {
    if (statusFilter) {
      if (['vencido','por_vencer'].includes(statusFilter)) {
        if (computeVirtual(q) !== statusFilter) return false;
      } else {
        if (q.status !== statusFilter) return false;
      }
    }
    if (search.trim()) {
      const qry = search.trim().toLowerCase();
      return (
        formatQuoteNumber(q.quote_number, business?.documentTitleType).toLowerCase().includes(qry) ||
        (q.wa_customers?.name || '').toLowerCase().includes(qry) ||
        (q.created_at || '').slice(0,10).includes(qry)
      );
    }
    return true;
  }), [quotes, statusFilter, search, business?.documentTitleType]);

  const handleStatus = async (id, status) => {
    setBusy(id + status);
    await updateCrmQuote(id, { status });
    await load();
    setBusy('');
  };

  const handleDuplicate = async (id) => {
    setBusy(id + 'dup');
    const { data } = await duplicateCrmQuote(id);
    setBusy('');
    if (data?.id) navigate(`/crm/presupuestos/${data.id}`);
    else load();
  };

  const handleConvert = async (q) => {
    if (!window.confirm(`¿Convertir ${formatQuoteNumber(q.quote_number, business?.documentTitleType)} en factura interna?`)) return;
    setBusy(q.id + 'conv');
    const { data, error } = await convertQuoteToInvoice(q.id);
    setBusy('');
    if (data?.id) navigate(`/crm/facturas/${data.id}`);
    else if (error) alert('Error: ' + error.message);
  };

  const FILTER_LABELS = {
    borrador:   { label: 'Borradores',  dot: STATUS_CONFIG.borrador.dot },
    enviado:    { label: 'Enviados',    dot: STATUS_CONFIG.enviado.dot },
    aceptado:   { label: 'Aceptados',  dot: STATUS_CONFIG.aceptado.dot },
    rechazado:  { label: 'Rechazados', dot: STATUS_CONFIG.rechazado.dot },
    vencido:    { label: 'Vencidos',   dot: 'bg-red-400' },
    por_vencer: { label: 'Por vencer', dot: 'bg-amber-400' },
  };

  const noun = loading ? '…' : `${quotes.length} ${quotes.length !== 1 ? docLabel.plural : docLabel.singular}`;

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        {/* ── Header ── */}
        <div className="mb-6">
          <DocListHeader
            title={`${docLabel.title}s`}
            count={quotes.length}
            noun={noun}
            ctaLabel={docLabel.nuevo}
            ctaIcon="FilePlus"
            onCta={() => navigate('/crm/presupuestos/nuevo')}
            loading={loading}
          />

          {/* KPIs */}
          {!loading && quotes.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                icon="DollarSign"
                label="Total cotizado"
                value={fmt(kpis.totalCotizado)}
                color="blue"
              />
              <KpiCard
                icon="ThumbsUp"
                label="Aceptados"
                value={kpis.aceptados}
                color="green"
                active={statusFilter === 'aceptado'}
                onClick={() => setStatusFilter(f => f === 'aceptado' ? null : 'aceptado')}
              />
              <KpiCard
                icon="Clock"
                label="Pendientes"
                value={kpis.pendientes}
                color="blue"
                active={statusFilter === 'enviado'}
                onClick={() => setStatusFilter(f => f === 'enviado' ? null : 'enviado')}
              />
              <KpiCard
                icon="AlertCircle"
                label="Vencidos"
                value={kpis.vencidos}
                color="red"
                active={statusFilter === 'vencido'}
                onClick={() => setStatusFilter(f => f === 'vencido' ? null : 'vencido')}
                sub={kpis.vencidos > 0 ? 'Requieren atención' : null}
              />
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        {!loading && quotes.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="Todos"
                count={counts.all}
                active={statusFilter === null}
                onClick={() => setStatusFilter(null)}
              />
              {FILTER_KEYS.map(key => (
                <FilterChip
                  key={key}
                  label={FILTER_LABELS[key].label}
                  count={counts[key] || 0}
                  active={statusFilter === key}
                  dot={FILTER_LABELS[key].dot}
                  onClick={() => setStatusFilter(f => f === key ? null : key)}
                />
              ))}
            </div>
            <DocSearchBar
              value={search}
              onChange={setSearch}
              placeholder={`Número, cliente o fecha…`}
            />
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Icon name="Loader2" size={28} className="animate-spin text-blue-500" />
          </div>
        ) : quotes.length === 0 ? (
          <DocEmptyState
            icon="FileText"
            title={`Sin ${docLabel.plural} todavía`}
            description={`Crea tu primer ${docLabel.singular} para comenzar.`}
            action={() => navigate('/crm/presupuestos/nuevo')}
            actionLabel={docLabel.nuevo}
            actionIcon="FilePlus"
          />
        ) : filtered.length === 0 ? (
          <DocNoResults
            search={search}
            onClear={() => { setSearch(''); setStatusFilter(null); }}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(q => (
              <QuoteCard
                key={q.id}
                q={{ ...q, _docTitleType: business?.documentTitleType }}
                busy={busy}
                fmt={fmt}
                docLabel={docLabel}
                onNavigate={() => navigate(`/crm/presupuestos/${q.id}`)}
                onStatus={handleStatus}
                onDuplicate={() => handleDuplicate(q.id)}
                onConvert={handleConvert}
              />
            ))}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
