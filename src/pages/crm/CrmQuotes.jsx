import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmQuotes, updateCrmQuote, duplicateCrmQuote, convertQuoteToInvoice, formatQuoteNumber } from '../../services/crmService';

const STATUS_COLORS = {
  borrador: 'bg-gray-700 text-gray-300',
  enviado: 'bg-blue-900/50 text-blue-300',
  aceptado: 'bg-green-900/50 text-green-300',
  rechazado: 'bg-red-900/50 text-red-300',
};

const STATUS_LABELS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };

export default function CrmQuotes() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmQuotes(business.id);
    setQuotes(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  const handleStatusChange = async (id, status) => {
    setActionLoading(id + status);
    await updateCrmQuote(id, { status });
    await load();
    setActionLoading(null);
  };

  const handleDuplicate = async (id) => {
    setActionLoading(id + 'dup');
    const { data } = await duplicateCrmQuote(id);
    setActionLoading(null);
    if (data?.id) navigate(`/crm/presupuestos/${data.id}`);
    else load();
  };

  const handleConvert = async (id) => {
    if (!window.confirm('¿Convertir este presupuesto en factura interna?')) return;
    setActionLoading(id + 'conv');
    const { data } = await convertQuoteToInvoice(id);
    setActionLoading(null);
    if (data?.id) navigate(`/crm/facturas/${data.id}`);
    else load();
  };

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader
          title="Presupuestos"
          subtitle={`${quotes.length} presupuesto${quotes.length !== 1 ? 's' : ''}`}
          icon="FileText"
          action={
            <button onClick={() => navigate('/crm/presupuestos/nuevo')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
              <Icon name="FilePlus" size={16} />Nuevo presupuesto
            </button>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Icon name="FileText" size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sin presupuestos todavía.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map(q => (
              <div key={q.id} className="bg-[#1a2535] rounded-xl p-4 hover:bg-[#1f2d40] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-white font-semibold text-sm whitespace-nowrap">{formatQuoteNumber(q.quote_number)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[q.status] || 'bg-gray-700 text-gray-300'}`}>{STATUS_LABELS[q.status] || q.status}</span>
                    <span className="text-gray-400 text-sm truncate">{q.wa_customers?.name || 'Sin cliente'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold">{fmt(q.total)}</span>
                    <span className="text-xs text-gray-500">{new Date(q.created_at).toLocaleDateString('es-CL')}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => navigate(`/crm/presupuestos/${q.id}`)} className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg flex items-center gap-1">
                    <Icon name="Eye" size={13} />Ver / Editar
                  </button>
                  <button onClick={() => handleDuplicate(q.id)} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg flex items-center gap-1">
                    <Icon name="Copy" size={13} />Duplicar
                  </button>
                  {q.status !== 'aceptado' && q.status !== 'rechazado' && (
                    <>
                      {q.status === 'borrador' && (
                        <button onClick={() => handleStatusChange(q.id, 'enviado')} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded-lg flex items-center gap-1">
                          <Icon name="Send" size={13} />Marcar enviado
                        </button>
                      )}
                      {q.status === 'enviado' && (
                        <>
                          <button onClick={() => handleStatusChange(q.id, 'aceptado')} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-green-900/40 hover:bg-green-800/50 text-green-300 rounded-lg flex items-center gap-1">
                            <Icon name="Check" size={13} />Aceptado
                          </button>
                          <button onClick={() => handleStatusChange(q.id, 'rechazado')} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-red-900/40 hover:bg-red-800/50 text-red-300 rounded-lg flex items-center gap-1">
                            <Icon name="X" size={13} />Rechazado
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {(q.status === 'aceptado') && !q.converted_to_invoice_id && (
                    <button onClick={() => handleConvert(q.id)} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-green-900/40 hover:bg-green-800/50 text-green-300 rounded-lg flex items-center gap-1">
                      <Icon name="ArrowRight" size={13} />Convertir a factura
                    </button>
                  )}
                  {q.converted_to_invoice_id && (
                    <span className="text-xs px-3 py-1.5 text-gray-500 flex items-center gap-1"><Icon name="CheckCircle" size={13} />Facturado</span>
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
