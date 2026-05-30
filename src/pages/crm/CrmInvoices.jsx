import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmInvoices, updateCrmInvoiceStatus, formatInvoiceNumber } from '../../services/crmService';

const STATUS_COLORS = {
  pendiente: 'bg-yellow-900/50 text-yellow-300',
  pagada: 'bg-green-900/50 text-green-300',
  anulada: 'bg-red-900/50 text-red-300',
};

export default function CrmInvoices() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmInvoices(business.id);
    setInvoices(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  const handleStatus = async (id, status) => {
    if (status === 'anulada' && !window.confirm('¿Anular esta factura?')) return;
    setActionLoading(id + status);
    await updateCrmInvoiceStatus(id, status);
    await load();
    setActionLoading(null);
  };

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader
          title="Facturas internas"
          subtitle={`${invoices.length} factura${invoices.length !== 1 ? 's' : ''}`}
          icon="Receipt"
          action={
            <button onClick={() => navigate('/crm/facturas/nueva')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
              <Icon name="PlusCircle" size={16} />Nueva factura
            </button>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Icon name="Receipt" size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sin facturas todavía.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="bg-[#1a2535] rounded-xl p-4 hover:bg-[#1f2d40] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-white font-semibold text-sm whitespace-nowrap">{formatInvoiceNumber(inv.invoice_number)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status] || 'bg-gray-700 text-gray-300'}`}>{inv.status}</span>
                    <span className="text-gray-400 text-sm truncate">{inv.wa_customers?.name || 'Sin cliente'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold">{fmt(inv.total)}</span>
                    <span className="text-xs text-gray-500">{new Date(inv.issue_date).toLocaleDateString('es-CL')}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => navigate(`/crm/facturas/${inv.id}`)} className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg flex items-center gap-1">
                    <Icon name="Eye" size={13} />Ver / PDF
                  </button>
                  {inv.status === 'pendiente' && (
                    <>
                      <button onClick={() => handleStatus(inv.id, 'pagada')} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-green-900/40 hover:bg-green-800/50 text-green-300 rounded-lg flex items-center gap-1">
                        <Icon name="CheckCircle" size={13} />Marcar pagada
                      </button>
                      <button onClick={() => handleStatus(inv.id, 'anulada')} disabled={!!actionLoading} className="text-xs px-3 py-1.5 bg-red-900/40 hover:bg-red-800/50 text-red-300 rounded-lg flex items-center gap-1">
                        <Icon name="XCircle" size={13} />Anular
                      </button>
                    </>
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
