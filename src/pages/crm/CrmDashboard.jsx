import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmDashboardStats } from '../../services/crmService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';

// Módulos activos — planRequired: true exige plan Business/Full
const MODULES = [
  {
    id: 'clientes',
    title: 'Clientes',
    description: 'Gestiona tu cartera de clientes y el historial comercial.',
    bullets: ['Datos de contacto', 'Historial de compras', 'Seguimiento comercial'],
    icon: 'Users',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    borderIdle: 'border-gray-200',
    borderHover: 'hover:border-blue-300',
    btnClass: 'bg-blue-600 hover:bg-blue-700',
    path: '/crm/clientes',
    planRequired: true,
  },
  {
    id: 'presupuestos',
    title: 'Presupuestos',
    description: 'Genera presupuestos profesionales en PDF y realiza seguimiento.',
    bullets: ['Crear y enviar presupuestos', 'PDF profesional', 'Control de estados'],
    icon: 'FileText',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    borderIdle: 'border-gray-200',
    borderHover: 'hover:border-purple-300',
    btnClass: 'bg-purple-600 hover:bg-purple-700',
    path: '/crm/presupuestos',
    planRequired: true,
  },
  {
    id: 'notas',
    title: 'Notas de venta',
    description: 'Registro comercial de ventas. Convierte presupuestos en ventas confirmadas.',
    bullets: ['Conversión desde presupuesto', 'Seguimiento de pagos', 'Historial de ventas'],
    icon: 'Receipt',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    borderIdle: 'border-gray-200',
    borderHover: 'hover:border-emerald-300',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700',
    path: '/crm/facturas',
    planRequired: true,
  },
  {
    id: 'stock',
    title: 'Stock',
    description: 'Control de inventario en tiempo real con alertas de reposición.',
    bullets: ['Entradas y salidas', 'Stock mínimo configurable', 'Alertas de reposición'],
    icon: 'Archive',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    borderIdle: 'border-gray-200',
    borderHover: 'hover:border-orange-300',
    btnClass: 'bg-orange-600 hover:bg-orange-700',
    path: '/crm/stock',
    planRequired: true,
  },
  {
    id: 'terminal',
    title: 'Terminal de ventas',
    description: 'Punto de venta rápido integrado con tu catálogo.',
    bullets: ['Venta rápida', 'Búsqueda de productos', 'Generación de venta'],
    icon: 'Monitor',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    borderIdle: 'border-gray-200',
    borderHover: 'hover:border-teal-300',
    btnClass: 'bg-teal-600 hover:bg-teal-700',
    path: '/crm/terminal',
    planRequired: true,
  },
  {
    id: 'informes',
    title: 'Informes',
    description: 'Indicadores y métricas de tu negocio en tiempo real.',
    bullets: ['Ventas por período', 'Productos más vendidos', 'Clientes frecuentes'],
    icon: 'BarChart2',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-400',
    borderIdle: 'border-gray-200',
    borderHover: '',
    btnClass: '',
    path: null,
    comingSoon: true,
  },
];

function ModuleCard({ mod, locked, stockAlert, navigate }) {
  const isLocked = locked && mod.planRequired;
  const isComingSoon = mod.comingSoon;
  const dimmed = isLocked || isComingSoon;

  const handleEnter = () => {
    if (isComingSoon) return;
    if (isLocked) { navigate('/planes'); return; }
    navigate(mod.path);
  };

  return (
    <div
      className={`relative min-w-0 max-w-full overflow-hidden bg-white border rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200
        ${mod.borderIdle} ${!dimmed ? mod.borderHover + ' hover:shadow-md' : ''}
        ${dimmed ? 'opacity-70' : ''}`}
    >
      {/* Badge */}
      {isComingSoon && (
        <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          Próximamente
        </span>
      )}
      {isLocked && !isComingSoon && (
        <span className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
          <Icon name="Lock" size={9} />Plan Full
        </span>
      )}

      {/* Icon + title */}
      <div className="flex min-w-0 items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${mod.iconBg}`}>
          <Icon name={mod.icon} size={22} className={mod.iconColor} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-gray-900 text-[15px] leading-snug flex min-w-0 items-center gap-2 flex-wrap [overflow-wrap:anywhere]">
            {mod.title}
            {stockAlert && (
              <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                {stockAlert} alerta{stockAlert !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug [overflow-wrap:anywhere]">{mod.description}</p>
        </div>
      </div>

      {/* Bullets */}
      <ul className="min-w-0 space-y-1.5 flex-1">
        {mod.bullets.map(b => (
          <li key={b} className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
            <Icon
              name={isComingSoon ? 'Circle' : isLocked ? 'Lock' : 'CheckCircle2'}
              size={13}
              className={`${isComingSoon ? 'text-gray-300' : isLocked ? 'text-amber-400' : mod.iconColor} shrink-0`}
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{b}</span>
          </li>
        ))}
      </ul>

      {/* CTA button */}
      {isComingSoon ? (
        <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-slate-400 bg-slate-100 cursor-default select-none">
          Próximamente
        </div>
      ) : isLocked ? (
        <button
          onClick={handleEnter}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="Zap" size={14} />
          Disponible en plan Full
        </button>
      ) : (
        <button
          onClick={handleEnter}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${mod.btnClass}`}
        >
          Entrar →
        </button>
      )}
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

  const effectivePlan = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasCrmAccess = effectivePlan === 'business';
  const stockAlertCount = stats?.stockBajo?.length || 0;

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            Centro de Gestión
          </h1>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Administra clientes, presupuestos, ventas, stock e informes.
          </p>
        }
      />

      <DashboardLayoutContent>
        {/* Context banner */}
        <div className="mb-6 flex min-w-0 max-w-full flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-4 text-white sm:flex-row sm:items-center">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon name="TrendingUp" size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Tu catálogo ya recibe pedidos.</p>
            <p className="text-xs text-white/70 mt-0.5">
              Desde aquí puedes transformar esa actividad en gestión comercial completa.
            </p>
          </div>
        </div>

        {/* Plan notice for non-business */}
        {!hasCrmAccess && (
          <div className="mb-5 flex min-w-0 max-w-full flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Icon name="Zap" size={18} className="text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-800">CRM disponible en plan Full</p>
                <p className="text-xs text-amber-600 mt-0.5">Desbloquea todos los módulos de gestión comercial.</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/planes')}
              className="shrink-0 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
            >
              Ver planes
            </button>
          </div>
        )}

        {/* Stock alert */}
        {hasCrmAccess && stockAlertCount > 0 && (
          <div className="mb-5 flex min-w-0 max-w-full flex-col gap-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Icon name="AlertTriangle" size={18} className="text-yellow-600 shrink-0" />
              <p className="min-w-0 text-sm text-yellow-800 font-medium [overflow-wrap:anywhere]">
                {stockAlertCount} producto{stockAlertCount !== 1 ? 's' : ''} con stock bajo o agotado
              </p>
            </div>
            <button
              onClick={() => navigate('/crm/stock')}
              className="shrink-0 text-xs font-semibold text-yellow-700 hover:underline"
            >
              Ver stock →
            </button>
          </div>
        )}

        {/* Module grid */}
        <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {MODULES.map(mod => (
            <ModuleCard
              key={mod.id}
              mod={mod}
              locked={!hasCrmAccess}
              stockAlert={mod.id === 'stock' ? stockAlertCount : 0}
              navigate={navigate}
            />
          ))}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
