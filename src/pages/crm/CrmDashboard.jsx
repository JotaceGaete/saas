import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmDashboardStats, formatQuoteNumber, formatInvoiceNumber } from '../../services/crmService';
import { FINANCIAL_BADGE_STYLES, getInvoiceFinancialState } from '../../services/crmPaymentsService';

const STATUS_Q = { borrador: 'bg-gray-100 text-gray-600', enviado: 'bg-blue-100 text-blue-700', aceptado: 'bg-green-100 text-green-700', rechazado: 'bg-red-100 text-red-600' };
const STATUS_I = { pendiente: 'bg-yellow-100 text-yellow-700', pagada: 'bg-green-100 text-green-700', anulada: 'bg-red-100 text-red-600' };

function MetricCard({ icon, label, value, iconColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-5 text-left w-full hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon name={icon} size={18} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </button>
  );
}

function RecentTable({ title, icon, items, renderRow, onViewAll }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        </div>
        <button onClick={onViewAll} className="text-xs text-blue-600 hover:underline font-medium">Ver todos →</button>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">Sin registros.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(renderRow)}
        </ul>
      )}
    </div>
  );
}

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business?.id) return;
    getCrmDashboardStats(business.id).then(s => { setStats(s); setLoading(false); });
  }, [business?.id]);

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>CRM</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Panel interno — solo administradores</p>}
        mobileActions={
          <div className="flex gap-2 w-full">
            <button onClick={() => navigate('/crm/presupuestos/nuevo')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              <Icon name="FilePlus" size={15} />Presupuesto
            </button>
            <button onClick={() => navigate('/crm/facturas/nueva')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              <Icon name="PlusCircle" size={15} />Factura
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/crm/presupuestos/nuevo')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium">
            <Icon name="FilePlus" size={14} />Presupuesto
          </button>
          <button onClick={() => navigate('/crm/facturas/nueva')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium">
            <Icon name="PlusCircle" size={14} />Factura
          </button>
        </div>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon="FileText" label="Presupuestado este mes" value={fmt(stats?.totalPresupuestadoMes)} iconColor="bg-purple-100 text-purple-600" onClick={() => navigate('/crm/presupuestos')} />
              <MetricCard icon="Receipt" label="Facturado este mes" value={fmt(stats?.totalFacturadoMes)} iconColor="bg-green-100 text-green-600" onClick={() => navigate('/crm/facturas')} />
              <MetricCard icon="CircleDollarSign" label="Ingresos recibidos" value={fmt(stats?.ingresosRecibidosMes)} iconColor="bg-emerald-100 text-emerald-600" onClick={() => navigate('/crm/facturas')} />
              <MetricCard icon="WalletCards" label="Saldo pendiente" value={fmt(stats?.saldoPendienteTotal)} iconColor="bg-yellow-100 text-yellow-600" onClick={() => navigate('/crm/facturas')} />
              <MetricCard icon="Split" label="Pago parcial" value={stats?.facturasPagoParcial ?? 0} iconColor="bg-blue-100 text-blue-600" onClick={() => navigate('/crm/facturas')} />
              <MetricCard icon="Users" label="Clientes" value={stats?.recentCustomers?.length ?? 0} iconColor="bg-blue-100 text-blue-600" onClick={() => navigate('/crm/clientes')} />
              <MetricCard icon="AlertTriangle" label="Stock bajo" value={stats?.stockBajo?.length ?? 0} iconColor="bg-yellow-100 text-yellow-600" onClick={() => navigate('/crm/stock')} />
            </div>

            {/* Accesos rápidos */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
              {[
                { label: 'Nuevo cliente', icon: 'UserPlus', path: '/crm/clientes' },
                { label: 'Nuevo presupuesto', icon: 'FilePlus', path: '/crm/presupuestos/nuevo' },
                { label: 'Nueva factura', icon: 'PlusCircle', path: '/crm/facturas/nueva' },
                { label: 'Control de stock', icon: 'Package', path: '/crm/stock' },
              ].map(a => (
                <button
                  key={a.path}
                  onClick={() => navigate(a.path)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm text-gray-700 rounded-lg text-sm font-medium transition-all"
                >
                  <Icon name={a.icon} size={15} className="text-blue-500 shrink-0" />
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>

            {/* Listas recientes */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <RecentTable
                title="Presupuestos recientes"
                icon="FileText"
                items={stats?.recentQuotes || []}
                onViewAll={() => navigate('/crm/presupuestos')}
                renderRow={q => (
                  <li key={q.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/presupuestos/${q.id}`)}>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatQuoteNumber(q.quote_number)}</p>
                      <p className="text-xs text-gray-400">{q.wa_customers?.name || 'Sin cliente'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_Q[q.status] || 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                  </li>
                )}
              />

              <RecentTable
                title="Facturas recientes"
                icon="Receipt"
                items={stats?.recentInvoices || []}
                onViewAll={() => navigate('/crm/facturas')}
                renderRow={inv => {
                  const financial = getInvoiceFinancialState(inv.total, inv.crm_payments || []);
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/facturas/${inv.id}`)}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{formatInvoiceNumber(inv.invoice_number)}</p>
                        <p className="text-xs text-gray-400 truncate">{inv.wa_customers?.name || 'Sin cliente'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_I[inv.status] || 'bg-gray-100 text-gray-600'}`}>{inv.status}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FINANCIAL_BADGE_STYLES[financial.key]}`}>{financial.label}</span>
                      </div>
                    </li>
                  );
                }}
              />

              <RecentTable
                title="Clientes recientes"
                icon="Users"
                items={stats?.recentCustomers || []}
                onViewAll={() => navigate('/crm/clientes')}
                renderRow={c => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50" onClick={() => navigate('/crm/clientes')}>
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name || 'Sin nombre'}</p>
                      {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                    </div>
                  </li>
                )}
              />
            </div>

            {/* Stock bajo */}
            {(stats?.stockBajo?.length || 0) > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="AlertTriangle" size={16} className="text-yellow-600" />
                  <h3 className="font-semibold text-yellow-800 text-sm">Productos con stock bajo o agotado</h3>
                </div>
                <ul className="space-y-2">
                  {stats.stockBajo.map(p => (
                    <li key={p.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{p.name}</span>
                      <span className="text-yellow-700 font-semibold">{p.stock_actual} / mín {p.stock_minimo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
