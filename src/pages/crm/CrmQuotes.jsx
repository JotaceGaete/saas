import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmQuotes, updateCrmQuote, duplicateCrmQuote, convertQuoteToInvoice, formatQuoteNumber } from '../../services/crmService';

const STATUS_STYLES = {
  borrador: 'bg-gray-100 text-gray-600',
  enviado:  'bg-blue-100 text-blue-700',
  aceptado: 'bg-green-100 text-green-700',
  rechazado:'bg-red-100 text-red-700',
};
const STATUS_LABELS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };

export default function CrmQuotes() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmQuotes(business.id);
    setQuotes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0,
  }).format(n || 0);

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
    if (!window.confirm(`¿Convertir ${formatQuoteNumber(q.quote_number)} en factura interna?`)) return;
    setBusy(q.id + 'conv');
    const { data, error } = await convertQuoteToInvoice(q.id);
    setBusy('');
    if (data?.id) navigate(`/crm/facturas/${data.id}`);
    else if (error) alert('Error: ' + error.message);
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Presupuestos</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{loading ? 'Cargando…' : `${quotes.length} presupuesto${quotes.length !== 1 ? 's' : ''}`}</p>}
      >
        <button
          onClick={() => navigate('/crm/presupuestos/nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Icon name="FilePlus" size={16} />
          Nuevo presupuesto
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="FileText" size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">Todavía no hay presupuestos.</p>
            <button
              onClick={() => navigate('/crm/presupuestos/nuevo')}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Icon name="FilePlus" size={16} />Crear primer presupuesto
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map(q => (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-bold text-gray-900 text-sm whitespace-nowrap">{formatQuoteNumber(q.quote_number)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                    <span className="text-gray-500 text-sm truncate">{q.wa_customers?.name || <em className="text-gray-400">Sin cliente</em>}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-bold text-gray-900">{fmt(q.total)}</span>
                    <span className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('es-CL')}</span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/crm/presupuestos/${q.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    <Icon name="Pencil" size={13} />Ver / Editar
                  </button>
                  <button
                    onClick={() => handleDuplicate(q.id)}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Icon name="Copy" size={13} />Duplicar
                  </button>
                  {q.status === 'borrador' && (
                    <button
                      onClick={() => handleStatus(q.id, 'enviado')}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <Icon name="Send" size={13} />Marcar enviado
                    </button>
                  )}
                  {q.status === 'enviado' && (
                    <>
                      <button
                        onClick={() => handleStatus(q.id, 'aceptado')}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        <Icon name="ThumbsUp" size={13} />Aceptado
                      </button>
                      <button
                        onClick={() => handleStatus(q.id, 'rechazado')}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Icon name="ThumbsDown" size={13} />Rechazado
                      </button>
                    </>
                  )}
                  {q.status === 'aceptado' && !q.converted_to_invoice_id && (
                    <button
                      onClick={() => handleConvert(q)}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 font-medium"
                    >
                      <Icon name="ArrowRightCircle" size={13} />Convertir a factura
                    </button>
                  )}
                  {q.converted_to_invoice_id && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-400">
                      <Icon name="CheckCircle2" size={13} />Facturado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
