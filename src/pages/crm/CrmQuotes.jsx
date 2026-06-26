import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmQuotes,
  updateCrmQuote,
  rejectCrmQuote,
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
// Estados persistentes: borrador | vigente | convertido | rechazado
// Estados calculados (solo UI): vencido | vence_pronto

const STATUS_CONFIG = {
  borrador:   { label: 'Borrador',   dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 ring-gray-200/60',       bar: 'bg-gray-200' },
  vigente:    { label: 'Vigente',    dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 ring-blue-200/60',       bar: 'bg-blue-400' },
  convertido: { label: 'Convertido', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60', bar: 'bg-emerald-500' },
  rechazado:  { label: 'Rechazado', dot: 'bg-red-300',     badge: 'bg-red-50 text-red-500 ring-red-200/60',          bar: 'bg-red-200' },
};

// Calcula el estado visual (puede diferir del persistente por vencimiento)
function getVisualStatus(q) {
  if (q.status === 'convertido' || q.status === 'rechazado') return q.status;
  const days = getDaysUntil(q.valid_until);
  if (days !== null && days < 0) return 'vencido';
  return q.status;
}

function getBarColor(q) {
  const vs = getVisualStatus(q);
  if (vs === 'vencido') return 'bg-red-200';
  return STATUS_CONFIG[vs]?.bar || 'bg-gray-200';
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTs(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Statuses where financial fields are editable
const FINANCIAL_EDITABLE_STATUSES = new Set(['borrador', 'vigente']);

// ─── Rejection modal ──────────────────────────────────────────────────────────

const REJECTION_OPTIONS = [
  'Precio muy alto',
  'Compró en otro lugar',
  'Cliente canceló',
  'Sin respuesta del cliente',
  'Otro',
];

function RejectionModal({ quote, docLabel, busy, onConfirm, onCancel }) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const [error, setError]       = useState('');

  const reason = selected === 'Otro' ? custom.trim() : selected;
  const valid  = reason.length >= 3;

  const handleSubmit = () => {
    if (!valid) { setError('Selecciona o escribe el motivo.'); return; }
    setError('');
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Rechazar presupuesto</h3>
            <p className="text-xs text-gray-400">{docLabel?.singular ? `${docLabel.singular} ` : ''}{formatQuoteNumber(quote?.quote_number)}</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <Icon name="X" size={17} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Motivo del rechazo</p>
          <div className="space-y-2">
            {REJECTION_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { setSelected(opt); setError(''); }}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                  selected === opt
                    ? 'border-red-300 bg-red-50 font-semibold text-red-700'
                    : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected === opt ? 'border-red-500' : 'border-gray-300'}`}>
                  {selected === opt && <span className="h-2 w-2 rounded-full bg-red-500" />}
                </span>
                {opt}
              </button>
            ))}
          </div>
          {selected === 'Otro' && (
            <textarea
              autoFocus
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Describe el motivo…"
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !valid}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {busy && <Icon name="Loader2" size={14} className="animate-spin" />}
            Registrar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quote card ───────────────────────────────────────────────────────────────

function QuoteCard({ q, busy, fmt, docLabel, onNavigate, onEmit, onConvert, onReject, onDuplicate }) {
  const canEditFinancial = FINANCIAL_EDITABLE_STATUSES.has(q.status) && !q.converted_to_invoice_id;
  const isConverted      = !!q.converted_to_invoice_id;
  const visualStatus     = getVisualStatus(q);
  const isVencido        = visualStatus === 'vencido';
  const cfg              = STATUS_CONFIG[q.status] || STATUS_CONFIG.borrador;
  const days             = getDaysUntil(q.valid_until);

  // Badge to display (computed may override persistent)
  const badgeLabel = isVencido ? 'Vencido' : cfg.label;
  const badgeDot   = isVencido ? 'bg-red-300' : cfg.dot;
  const badgeCls   = isVencido ? 'bg-red-50 text-red-500 ring-red-200/60' : cfg.badge;

  const menuItems = [
    { icon: 'Eye',      label: 'Ver presupuesto', onClick: onNavigate },
    { icon: 'FileText', label: 'Ver PDF',          onClick: onNavigate },
    { type: 'divider' },
    { icon: 'Copy',     label: 'Duplicar',         onClick: onDuplicate, disabled: !!busy },
    { icon: 'Send',     label: 'Enviar por email', soon: true },
    { icon: 'Share2',   label: 'Compartir enlace', soon: true },
    { icon: 'History',  label: 'Historial',        soon: true },
  ];

  if (q.status === 'borrador') {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'CheckCircle', label: 'Emitir presupuesto', onClick: onEmit, disabled: !!busy });
    menuItems.push({ icon: 'ThumbsDown', label: 'Rechazar',            onClick: onReject, red: true, disabled: !!busy });
  }
  if (q.status === 'vigente') {
    menuItems.push({ type: 'divider' });
    menuItems.push({ icon: 'ArrowRightCircle', label: 'Convertir en nota de venta', onClick: onConvert, green: true, disabled: !!busy });
    menuItems.push({ icon: 'ThumbsDown',       label: 'Rechazar',                   onClick: onReject,  red:   true, disabled: !!busy });
  }

  return (
    <div
      onClick={onNavigate}
      className={`group relative flex cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-px hover:shadow-md ${
        isVencido ? 'border-gray-100 opacity-70 hover:opacity-100' : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      {/* Left color bar */}
      <div className={`w-1 shrink-0 self-stretch ${getBarColor(q)} transition-all group-hover:w-1.5`} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        {/* Col 1 — Identity */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isVencido || q.status === 'rechazado' ? 'bg-gray-50 text-gray-300' : 'bg-blue-50 text-blue-400'}`}>
            <Icon name="FileText" size={17} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-bold tracking-tight text-gray-900">
                {formatQuoteNumber(q.quote_number, q._docTitleType)}
              </span>
              <DocStatusBadge label={badgeLabel} dot={badgeDot} badge={badgeCls} />
              {isConverted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                  <Icon name="ArrowRightCircle" size={10} />
                  Nota de venta vinculada
                </span>
              )}
            </div>
            <p className="truncate text-xs">
              {q.wa_customers?.name
                ? <span className="font-medium text-gray-600">{q.wa_customers.name}</span>
                : <em className="text-gray-300">Sin cliente</em>}
              {q.wa_customers?.company && (
                <span className="text-gray-400"> · {q.wa_customers.company}</span>
              )}
            </p>

            {/* Expiry indicator (only for active quotes) */}
            {q.valid_until && ['borrador','vigente'].includes(q.status) && (
              <div className="mt-1">
                <ExpiryPill days={days} />
              </div>
            )}

            {/* Rejection reason */}
            {q.status === 'rechazado' && q.rejection_reason && (
              <p className="mt-0.5 text-[11px] text-gray-400">
                <Icon name="MessageSquare" size={10} className="mr-0.5 inline" />
                {q.rejection_reason}
                {q.rejected_at && <span className="ml-1">· {fmtTs(q.rejected_at)}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Col 2 — Dates */}
        <div className="hidden w-36 shrink-0 space-y-1.5 sm:block">
          {q.created_at && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Emisión</p>
              <p className="text-xs font-medium text-gray-600">{fmtDate(q.created_at?.slice(0,10))}</p>
            </div>
          )}
          {q.valid_until && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vence</p>
              <p className={`text-xs font-medium ${isVencido ? 'text-red-400' : days !== null && days <= 3 ? 'font-semibold text-amber-600' : 'text-gray-600'}`}>
                {fmtDate(q.valid_until)}
              </p>
            </div>
          )}
        </div>

        {/* Col 3 — Amount */}
        <div className="shrink-0 text-right sm:w-28">
          <p className={`text-xl font-black tracking-tight ${isVencido || q.status === 'rechazado' ? 'text-gray-400' : 'text-gray-900'}`}>
            {fmt(q.total)}
          </p>
        </div>

        {/* Col 4 — Actions */}
        <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
          {/* Primary CTA based on status */}
          {q.status === 'borrador' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEmit(); }}
              disabled={!!busy}
              className="hidden items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40 sm:flex"
            >
              <Icon name="CheckCircle" size={13} />
              Emitir
            </button>
          )}
          {q.status === 'vigente' && !isVencido && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConvert(); }}
              disabled={!!busy}
              className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 sm:flex"
            >
              <Icon name="ArrowRightCircle" size={13} />
              Convertir
            </button>
          )}
          {(q.status === 'convertido' || isVencido || q.status === 'rechazado') && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNavigate(); }}
              className="hidden items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 sm:flex"
            >
              <Icon name="Eye" size={13} />
              Ver
            </button>
          )}
          <DocActionMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Virtual filter keys (vencido is computed, not stored)
const FILTER_KEYS = ['borrador', 'vigente', 'convertido', 'rechazado', 'vencido'];

const FILTER_LABELS = {
  borrador:   { label: 'Borradores',  dot: STATUS_CONFIG.borrador.dot },
  vigente:    { label: 'Vigentes',    dot: STATUS_CONFIG.vigente.dot },
  convertido: { label: 'Convertidos', dot: STATUS_CONFIG.convertido.dot },
  rechazado:  { label: 'Rechazados', dot: STATUS_CONFIG.rechazado.dot },
  vencido:    { label: 'Vencidos',   dot: 'bg-red-300' },
};

function matchesFilter(q, filter) {
  if (!filter) return true;
  if (filter === 'vencido') return getVisualStatus(q) === 'vencido';
  return q.status === filter;
}

export default function CrmQuotes() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [quotes, setQuotes]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [rejectingQuote, setRejectingQuote] = useState(null);

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

  // KPIs — based on what matters commercially
  const kpis = useMemo(() => {
    const active    = quotes.filter(q => ['borrador','vigente'].includes(q.status));
    const vencidos  = active.filter(q => getVisualStatus(q) === 'vencido');
    const vigentes  = quotes.filter(q => q.status === 'vigente' && getVisualStatus(q) !== 'vencido');
    return {
      totalActivo:   active.reduce((s, q) => s + (q.total || 0), 0),
      vigentes:      vigentes.length,
      convertidos:   quotes.filter(q => q.status === 'convertido').length,
      vencidos:      vencidos.length,
    };
  }, [quotes]);

  // Counts per filter chip
  const counts = useMemo(() => ({
    all:        quotes.length,
    borrador:   quotes.filter(q => q.status === 'borrador').length,
    vigente:    quotes.filter(q => q.status === 'vigente' && getVisualStatus(q) !== 'vencido').length,
    convertido: quotes.filter(q => q.status === 'convertido').length,
    rechazado:  quotes.filter(q => q.status === 'rechazado').length,
    vencido:    quotes.filter(q => getVisualStatus(q) === 'vencido').length,
  }), [quotes]);

  const filtered = useMemo(() => quotes.filter(q => {
    if (!matchesFilter(q, statusFilter)) return false;
    if (search.trim()) {
      const qry = search.trim().toLowerCase();
      return (
        formatQuoteNumber(q.quote_number, business?.documentTitleType).toLowerCase().includes(qry) ||
        (q.wa_customers?.name || '').toLowerCase().includes(qry) ||
        (q.created_at || '').slice(0, 10).includes(qry)
      );
    }
    return true;
  }), [quotes, statusFilter, search, business?.documentTitleType]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleEmit = async (id) => {
    setBusy(id + 'emit');
    await updateCrmQuote(id, { status: 'vigente' });
    await load();
    setBusy('');
  };

  const handleConvert = async (q) => {
    if (!window.confirm(`¿Convertir ${formatQuoteNumber(q.quote_number, business?.documentTitleType)} en nota de venta? Se creará automáticamente.`)) return;
    setBusy(q.id + 'conv');
    const { data, error } = await convertQuoteToInvoice(q.id);
    setBusy('');
    if (data?.id) navigate(`/crm/facturas/${data.id}`);
    else if (error) alert('Error: ' + error.message);
  };

  const handleRejectConfirm = async (reason) => {
    if (!rejectingQuote) return;
    setBusy(rejectingQuote.id + 'reject');
    await rejectCrmQuote(rejectingQuote.id, reason);
    setBusy('');
    setRejectingQuote(null);
    await load();
  };

  const handleDuplicate = async (id) => {
    setBusy(id + 'dup');
    const { data } = await duplicateCrmQuote(id);
    setBusy('');
    if (data?.id) navigate(`/crm/presupuestos/${data.id}`);
    else load();
  };

  const noun = loading
    ? '…'
    : `${quotes.length} ${quotes.length !== 1 ? docLabel.plural : docLabel.singular}`;

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

          {!loading && quotes.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                icon="DollarSign"
                label="Valor activo cotizado"
                value={fmt(kpis.totalActivo)}
                color="blue"
              />
              <KpiCard
                icon="FileCheck"
                label="Vigentes"
                value={kpis.vigentes}
                color="blue"
                active={statusFilter === 'vigente'}
                onClick={() => setStatusFilter(f => f === 'vigente' ? null : 'vigente')}
                sub={kpis.vigentes > 0 ? 'Esperando respuesta' : null}
              />
              <KpiCard
                icon="ArrowRightCircle"
                label="Convertidos"
                value={kpis.convertidos}
                color="green"
                active={statusFilter === 'convertido'}
                onClick={() => setStatusFilter(f => f === 'convertido' ? null : 'convertido')}
              />
              <KpiCard
                icon="AlertCircle"
                label="Vencidos"
                value={kpis.vencidos}
                color="red"
                active={statusFilter === 'vencido'}
                onClick={() => setStatusFilter(f => f === 'vencido' ? null : 'vencido')}
                sub={kpis.vencidos > 0 ? 'Sin respuesta' : null}
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
              placeholder="Número, cliente o fecha…"
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
                onEmit={() => handleEmit(q.id)}
                onConvert={() => handleConvert(q)}
                onReject={() => setRejectingQuote(q)}
                onDuplicate={() => handleDuplicate(q.id)}
              />
            ))}
          </div>
        )}

        {/* ── Rejection modal ── */}
        {rejectingQuote && (
          <RejectionModal
            quote={rejectingQuote}
            docLabel={docLabel}
            busy={!!busy}
            onConfirm={handleRejectConfirm}
            onCancel={() => setRejectingQuote(null)}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
