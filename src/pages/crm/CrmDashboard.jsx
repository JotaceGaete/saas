import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmDashboardStats } from '../../services/crmService';

const MODULES = [
  {
    id: 'clientes',
    title: 'Clientes',
    description: 'Gestiona tu cartera de clientes.',
    bullets: ['Historial de compras', 'Datos de contacto', 'Seguimiento comercial'],
    icon: 'Users',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    accentBorder: 'border-blue-200 hover:border-blue-400',
    accentBtn: 'bg-blue-600 hover:bg-blue-700',
    path: '/crm/clientes',
  },
  {
    id: 'presupuestos',
    title: 'Presupuestos',
    description: 'Genera y administra presupuestos profesionales.',
    bullets: ['Crear presupuesto', 'PDF profesional', 'Seguimiento de estado'],
    icon: 'FileText',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    accentBorder: 'border-purple-200 hover:border-purple-400',
    accentBtn: 'bg-purple-600 hover:bg-purple-700',
    path: '/crm/presupuestos',
  },
  {
    id: 'notas',
    title: 'Notas de venta',
    description: 'Registro comercial de tus ventas.',
    bullets: ['Conversión desde presupuesto', 'Seguimiento de pagos', 'Estados y historial'],
    icon: 'Receipt',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    accentBorder: 'border-emerald-200 hover:border-emerald-400',
    accentBtn: 'bg-emerald-600 hover:bg-emerald-700',
    path: '/crm/facturas',
  },
  {
    id: 'stock',
    title: 'Stock',
    description: 'Control de inventario en tiempo real.',
    bullets: ['Entradas y salidas', 'Stock mínimo configurable', 'Alertas de reposición'],
    icon: 'Archive',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    accentBorder: 'border-orange-200 hover:border-orange-400',
    accentBtn: 'bg-orange-600 hover:bg-orange-700',
    path: '/crm/stock',
  },
  {
    id: 'terminal',
    title: 'Terminal de ventas',
    description: 'Punto de venta rápido para tu negocio.',
    bullets: ['Venta rápida', 'Búsqueda de productos', 'Generación de venta'],
    icon: 'Monitor',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-400',
    accentBorder: 'border-gray-200',
    accentBtn: 'bg-gray-300',
    path: null,
    comingSoon: true,
  },
  {
    id: 'informes',
    title: 'Informes',
    description: 'Indicadores y métricas de tu negocio.',
    bullets: ['Ventas por período', 'Productos más vendidos', 'Clientes frecuentes'],
    icon: 'BarChart2',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-400',
    accentBorder: 'border-gray-200',
    accentBtn: 'bg-gray-300',
    path: null,
    comingSoon: true,
  },
];

function ModuleCard({ mod, stats, navigate }) {
  const stockAlert = mod.id === 'stock' && (stats?.stockBajo?.length || 0) > 0;

  return (
    <div
      className={`relative bg-white border-2 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 ${mod.accentBorder} ${mod.comingSoon ? 'opacity-60' : 'hover:shadow-md'}`}
    >
      {mod.comingSoon && (
        <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          Próximamente
        </span>
      )}

      {/* Icon + title */}
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${mod.iconBg}`}>
          <Icon name={mod.icon} size={22} className={mod.iconColor} />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-[15px] leading-tight flex items-center gap-2">
            {mod.title}
            {stockAlert && (
              <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                {stats.stockBajo.length} alerta{stats.stockBajo.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
        </div>
      </div>

      {/* Bullet points */}
      <ul className="space-y-1.5 flex-1">
        {mod.bullets.map(b => (
          <li key={b} className="flex items-center gap-2 text-sm text-gray-500">
            <Icon name={mod.comingSoon ? 'Circle' : 'CheckCircle2'} size={13} className={mod.comingSoon ? 'text-gray-300' : mod.iconColor} />
            {b}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => !mod.comingSoon && navigate(mod.path)}
        disabled={mod.comingSoon}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${mod.accentBtn} disabled:cursor-not-allowed`}
      >
        {mod.comingSoon ? 'Próximamente' : 'Entrar →'}
      </button>
    </div>
  );
}

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    getCrmDashboardStats(business.id).then(s => setStats(s));
  }, [business?.id]);

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            CRM
          </h1>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Centro de gestión comercial
          </p>
        }
      />

      <DashboardLayoutContent>
        {/* Intro banner */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Icon name="LayoutDashboard" size={20} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Tu catálogo ya funciona.</p>
            <p className="text-xs text-gray-500 mt-0.5">Ahora también puedes administrar tu negocio desde aquí.</p>
          </div>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map(mod => (
            <ModuleCard key={mod.id} mod={mod} stats={stats} navigate={navigate} />
          ))}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
