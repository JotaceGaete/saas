import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmDashboardStats, formatQuoteNumber, formatInvoiceNumber } from '../../services/crmService';

function StatCard({ icon, label, value, color = 'text-blue-400', onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-[#1a2535] rounded-xl p-5 text-left w-full hover:bg-[#1f2d40] transition-colors"
    >
      <div className="flex items-center gap-3 mb-2">
        <Icon name={icon} size={20} className={color} />
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </button>
  );
}

function RecentList({ title, items, icon, renderItem, onViewAll }) {
  return (
    <div className="bg-[#1a2535] rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={18} className="text-blue-400" />
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <button onClick={onViewAll} className="text-xs text-blue-400 hover:underline">Ver todos</button>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">Sin registros aún.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(renderItem)}
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
      <DashboardLayoutContent>
        <PanelHeader title="CRM" subtitle="Clientes, presupuestos y facturación interna" icon="BarChart2" />

        {loading ? (
          <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
        ) : (
          <div className="space-y-6">
            {/* Métricas del mes */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon="FileText" label="Presupuestado este mes" value={fmt(stats?.totalPresupuestadoMes)} color="text-purple-400" onClick={() => navigate('/crm/presupuestos')} />
              <StatCard icon="Receipt" label="Facturado este mes" value={fmt(stats?.totalFacturadoMes)} color="text-green-400" onClick={() => navigate('/crm/facturas')} />
              <StatCard icon="Users" label="Clientes recientes" value={stats?.recentCustomers?.length ?? 0} color="text-blue-400" onClick={() => navigate('/crm/clientes')} />
              <StatCard icon="AlertTriangle" label="Stock bajo" value={stats?.stockBajo?.length ?? 0} color="text-yellow-400" onClick={() => navigate('/crm/stock')} />
            </div>

            {/* Accesos rápidos */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Nuevo presupuesto', icon: 'FilePlus', path: '/crm/presupuestos/nuevo' },
                { label: 'Nueva factura', icon: 'PlusCircle', path: '/crm/facturas/nueva' },
                { label: 'Nuevo cliente', icon: 'UserPlus', path: '/crm/clientes/nuevo' },
                { label: 'Stock', icon: 'Package', path: '/crm/stock' },
              ].map(a => (
                <button
                  key={a.path}
                  onClick={() => navigate(a.path)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                >
                  <Icon name={a.icon} size={16} />
                  {a.label}
                </button>
              ))}
            </div>

            {/* Listas recientes */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <RecentList
                title="Presupuestos recientes"
                icon="FileText"
                items={stats?.recentQuotes || []}
                onViewAll={() => navigate('/crm/presupuestos')}
                renderItem={q => (
                  <li key={q.id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-sm text-white font-medium">{formatQuoteNumber(q.quote_number)}</span>
                      <p className="text-xs text-gray-400">{q.wa_customers?.name || 'Sin cliente'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      q.status === 'aceptado' ? 'bg-green-900/50 text-green-400' :
                      q.status === 'rechazado' ? 'bg-red-900/50 text-red-400' :
                      q.status === 'enviado' ? 'bg-blue-900/50 text-blue-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>{q.status}</span>
                  </li>
                )}
              />

              <RecentList
                title="Facturas recientes"
                icon="Receipt"
                items={stats?.recentInvoices || []}
                onViewAll={() => navigate('/crm/facturas')}
                renderItem={inv => (
                  <li key={inv.id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-sm text-white font-medium">{formatInvoiceNumber(inv.invoice_number)}</span>
                      <p className="text-xs text-gray-400">{inv.wa_customers?.name || 'Sin cliente'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === 'pagada' ? 'bg-green-900/50 text-green-400' :
                      inv.status === 'anulada' ? 'bg-red-900/50 text-red-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>{inv.status}</span>
                  </li>
                )}
              />

              <RecentList
                title="Clientes recientes"
                icon="Users"
                items={stats?.recentCustomers || []}
                onViewAll={() => navigate('/crm/clientes')}
                renderItem={c => (
                  <li key={c.id} className="flex items-center gap-3 py-1 border-b border-white/5 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-white">{c.name || 'Sin nombre'}</p>
                      {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                    </div>
                  </li>
                )}
              />
            </div>

            {/* Stock bajo */}
            {(stats?.stockBajo?.length || 0) > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="AlertTriangle" size={18} className="text-yellow-400" />
                  <h3 className="font-semibold text-yellow-300">Productos con stock bajo</h3>
                </div>
                <ul className="space-y-1">
                  {stats.stockBajo.map(p => (
                    <li key={p.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">{p.name}</span>
                      <span className="text-yellow-400 font-medium">{p.stock_actual} / mín {p.stock_minimo}</span>
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
