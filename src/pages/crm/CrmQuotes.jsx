import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmQuotes, updateCrmQuote, duplicateCrmQuote, convertQuoteToInvoice, formatQuoteNumber, getQuoteDocLabel } from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';

const STATUS_STYLES = {
  borrador:  'bg-gray-100 text-gray-600',
  enviado:   'bg-blue-100 text-blue-700',
  aceptado:  'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };
const EDITABLE_QUOTE_STATUSES = new Set(['borrador', 'enviado', 'pendiente']);

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'enviado', label: 'Enviados' },
  { value: 'aceptado', label: 'Aceptados' },
  { value: 'rechazado', label: 'Rechazados' },
];

const DATE_OPTIONS = [
  { value: '', label: 'Cualquier fecha' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Últimos 7 días' },
  { value: 'month', label: 'Este mes' },
];

function isInDateRange(dateStr, range) {
  if (!range || !dateStr) return true;
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return date >= startOfToday && date < new Date(startOfToday.getTime() + 86_400_000);
  if (range === 'week')  return date >= new Date(startOfToday.getTime() - 6 * 86_400_000);
  if (range === 'month') return date >= new Date(now.getFullYear(), now.getMonth(), 1);
  return true;
}

function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function CrmQuotes() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmQuotes(business.id);
    setQuotes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => formatMoney(n, business?.currency);

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

  const docLabel = getQuoteDocLabel(business?.documentTitleType);

  const filtered = useMemo(() => {
    let list = quotes;

    if (statusFilter) {
      list = list.filter(q => q.status === statusFilter);
    }

    if (dateFilter) {
      list = list.filter(q => isInDateRange(q.created_at, dateFilter));
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(q => {
        const num     = formatQuoteNumber(q.quote_number, business?.documentTitleType)?.toLowerCase() ?? '';
        const name    = q.wa_customers?.name?.toLowerCase() ?? '';
        const company = q.wa_customers?.company?.toLowerCase() ?? '';
        const rut     = q.wa_customers?.rut?.toLowerCase() ?? '';
        const phone   = q.wa_customers?.phone?.toLowerCase() ?? '';
        const status  = (STATUS_LABELS[q.status] ?? q.status ?? '').toLowerCase();
        const total   = String(q.total ?? '');
        return num.includes(query) || name.includes(query) || company.includes(query) || rut.includes(query) || phone.includes(query) || status.includes(query) || total.includes(query);
      });
    }

    return list;
  }, [quotes, searchQuery, statusFilter, dateFilter, business?.documentTitleType]);

  const hasFilters = !!(searchQuery.trim() || statusFilter || dateFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setDateFilter('');
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<><CrmBreadcrumb section={`${docLabel.title}s`} /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>{docLabel.title}s</h1></>}
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {loading ? 'Cargando…' : hasFilters
              ? `${filtered.length} de ${quotes.length} ${quotes.length !== 1 ? docLabel.plural : docLabel.singular}`
              : `${quotes.length} ${quotes.length !== 1 ? docLabel.plural : docLabel.singular}`}
          </p>
        }
        mobileActions={
          <button
            onClick={() => navigate('/crm/presupuestos/nuevo')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Icon name="FilePlus" size={16} />
            {docLabel.nuevo}
          </button>
        }
      >
        <button
          onClick={() => navigate('/crm/presupuestos/nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Icon name="FilePlus" size={16} />
          {docLabel.nuevo}
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Search & Filters — solo visible si hay al menos un documento */}
            {quotes.length > 0 && (
              <div className="space-y-2.5 bg-white border border-gray-200 rounded-xl p-4">
                {/* Search input */}
                <div className="relative">
                  <Icon name="Search" size={15} color="#9CA3AF" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Número, cliente, RUT, teléfono, monto…`}
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-gray-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Limpiar búsqueda"
                    >
                      <Icon name="X" size={14} />
                    </button>
                  )}
                </div>

                {/* Estado */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400 font-medium shrink-0">Estado:</span>
                  <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
                </div>

                {/* Fecha */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400 font-medium shrink-0">Fecha:</span>
                  <FilterChips options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} />
                </div>
              </div>
            )}

            {/* Resultados */}
            {filtered.length === 0 ? (
              quotes.length === 0 ? (
                <div className="text-center py-20">
                  <Icon name="FileText" size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">Todavía no hay {docLabel.plural}.</p>
                  <button
                    onClick={() => navigate('/crm/presupuestos/nuevo')}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Icon name="FilePlus" size={16} />Crear primer {docLabel.singular}
                  </button>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Icon name="SearchX" size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-600 font-medium">No encontramos documentos con esa búsqueda.</p>
                  <p className="text-sm text-gray-400 mt-1">Intenta con otro término o ajusta los filtros.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 text-sm text-blue-600 hover:underline"
                  >
                    Limpiar filtros
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {filtered.map(q => {
                  const canEdit = EDITABLE_QUOTE_STATUSES.has(q.status) && !q.converted_to_invoice_id;
                  return (
                    <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-bold text-gray-900 text-sm whitespace-nowrap">{formatQuoteNumber(q.quote_number, business?.documentTitleType)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[q.status] || q.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">{q.wa_customers?.name || <em className="text-gray-400">Sin cliente</em>}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-gray-900 text-sm">{fmt(q.total)}</p>
                          <p className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('es-CL')}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                        {canEdit && (
                          <button
                            onClick={() => navigate(`/crm/presupuestos/${q.id}`)}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                          >
                            <Icon name="Pencil" size={13} />Editar
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/crm/presupuestos/${q.id}`)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          <Icon name="Eye" size={13} />Ver / PDF
                        </button>
                        <button
                          onClick={() => handleDuplicate(q.id)}
                          disabled={!!busy}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Icon name="Copy" size={13} />Duplicar
                        </button>
                        {q.status === 'borrador' && (
                          <button
                            onClick={() => handleStatus(q.id, 'enviado')}
                            disabled={!!busy}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            <Icon name="Send" size={13} />Marcar enviado
                          </button>
                        )}
                        {q.status === 'enviado' && (
                          <>
                            <button
                              onClick={() => handleStatus(q.id, 'aceptado')}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                            >
                              <Icon name="ThumbsUp" size={13} />Aceptado
                            </button>
                            <button
                              onClick={() => handleStatus(q.id, 'rechazado')}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Icon name="ThumbsDown" size={13} />Rechazado
                            </button>
                          </>
                        )}
                        {q.status === 'aceptado' && !q.converted_to_invoice_id && (
                          <button
                            onClick={() => handleConvert(q)}
                            disabled={!!busy}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 font-medium"
                          >
                            <Icon name="ArrowRightCircle" size={13} />Convertir a factura
                          </button>
                        )}
                        {q.converted_to_invoice_id && (
                          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 text-gray-400">
                            <Icon name="CheckCircle2" size={13} />Facturado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
