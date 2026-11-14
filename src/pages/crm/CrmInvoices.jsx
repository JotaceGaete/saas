import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmInvoices, updateCrmInvoiceStatus, formatInvoiceNumber } from '../../services/crmService';
import { formatMoney } from '../../utils/formatMoney';

// El estado va como texto con un punto de color: sin pastillas de colores compitiendo entre sí.
const STATUS_STYLES = {
  pendiente: 'text-amber-700',
  parcial:   'text-amber-700',
  pagada:    'text-green-700',
  anulada:   'text-red-600',
};

export default function CrmInvoices() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmInvoices(business.id);
    setInvoices(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => formatMoney(n, business?.currency);

  const filtered = search.trim()
    ? invoices.filter(inv => {
        const q = search.trim().toLowerCase();
        return (
          formatInvoiceNumber(inv.invoice_number).toLowerCase().includes(q) ||
          (inv.wa_customers?.name || '').toLowerCase().includes(q) ||
          (inv.issue_date || '').includes(q)
        );
      })
    : invoices;

  const handleStatus = async (id, status) => {
    if (status === 'anulada' && !window.confirm('¿Anular esta factura? Esta acción no se puede deshacer.')) return;
    setBusy(id + status);
    await updateCrmInvoiceStatus(id, status);
    await load();
    setBusy('');
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<><CrmBreadcrumb section="Notas de venta" /><h1 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Facturas internas</h1></>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{loading ? 'Cargando…' : `${invoices.length} factura${invoices.length !== 1 ? 's' : ''}`}</p>}
        mobileActions={
          <button
            onClick={() => navigate('/crm/facturas/nueva')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Icon name="PlusCircle" size={16} />
            Nueva factura
          </button>
        }
      >
        <button
          onClick={() => navigate('/crm/facturas/nueva')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Icon name="PlusCircle" size={16} />
          Nueva factura
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        {!loading && invoices.length > 0 && (
          <div className="mb-4">
            <div className="relative">
              <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por número, cliente o fecha…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="Receipt" size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">Todavía no hay facturas internas.</p>
            <button
              onClick={() => navigate('/crm/facturas/nueva')}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Icon name="PlusCircle" size={16} />Crear primera factura
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="SearchX" size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-sm">Sin resultados para <strong>"{search}"</strong></p>
            <button onClick={() => setSearch('')} className="mt-2 text-blue-600 text-sm hover:underline">Limpiar búsqueda</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(inv => {
              const pagado = (inv.crm_payments || []).reduce((s, p) => s + (p.amount || 0), 0);
              const saldo  = (inv.total || 0) - pagado;
              const fullPaid = saldo <= 0 && pagado > 0;
              const partial  = saldo > 0 && pagado > 0;
              return (
                <div key={inv.id} className={`bg-white border border-gray-200 rounded-xl p-4 ${inv.status === 'anulada' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">{formatInvoiceNumber(inv.invoice_number)}</span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_STYLES[inv.status] || 'text-gray-600'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                        {fullPaid && inv.status !== 'pagada' && (
                          <span className="text-xs font-medium text-green-700">· Completamente pagada</span>
                        )}
                        {partial && (
                          <span className="text-xs font-medium text-amber-700">· Pago parcial</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{inv.wa_customers?.name || <em className="text-gray-400">Sin cliente</em>}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900 text-sm tabular-nums">{fmt(inv.total)}</p>
                      <p className="text-xs text-gray-400">{new Date(inv.issue_date).toLocaleDateString('es-CL')}</p>
                    </div>
                  </div>

                  {/* Solo mostramos el desglose cuando todavía queda saldo; en una venta pagada
                      repetir "Pagado: total" no aporta información. */}
                  {saldo > 0 && pagado > 0 && (
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                      <span>Pagado: <span className="font-medium text-green-700">{fmt(pagado)}</span></span>
                      <span>Saldo: <span className="font-medium text-yellow-700">{fmt(saldo)}</span></span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {inv.status === 'pendiente' && (
                      <button
                        onClick={() => handleStatus(inv.id, 'pagada')}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
                      >
                        <Icon name="CheckCircle2" size={13} />Marcar pagada
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/crm/facturas/${inv.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <Icon name="Eye" size={13} />Ver / PDF
                    </button>
                    {inv.status === 'pendiente' && (
                      <button
                        onClick={() => navigate(`/crm/facturas/${inv.id}`)}
                        className="inline-flex items-center gap-1.5 text-xs px-2 py-2 rounded-lg text-gray-500 hover:text-gray-800"
                      >
                        <Icon name="Pencil" size={13} />Editar
                      </button>
                    )}
                    {inv.status === 'pendiente' && (
                      <button
                        onClick={() => handleStatus(inv.id, 'anulada')}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1.5 text-xs px-2 py-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Icon name="XCircle" size={13} />Anular
                      </button>
                    )}
                    {inv.status === 'pagada' && (
                      <span className="text-xs text-gray-500">
                        Pagada {inv.paid_at ? `el ${new Date(inv.paid_at).toLocaleDateString('es-CL')}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
