import React, { useState, useMemo } from 'react';
import Icon from 'components/AppIcon';
import {
  PLAN_FEATURES,
  getFeaturesByPlan,
} from 'config/planFeatures';

// ── Constantes ─────────────────────────────────────────────────────────────

const PLANS = ['starter', 'pro', 'business'];

const PLAN_META = {
  starter:  { label: 'Starter',  color: 'bg-slate-100 text-slate-700',   dot: 'bg-slate-400' },
  pro:      { label: 'Pro',      color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  business: { label: 'Business', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

const STATUS_META = {
  active:     { label: 'Activa',     color: 'bg-green-100 text-green-700' },
  planned:    { label: 'Próxima',    color: 'bg-amber-100 text-amber-700' },
  deprecated: { label: 'Deprecada', color: 'bg-red-100 text-red-700' },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function PlanBadge({ plan }) {
  const m = PLAN_META[plan];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.color}`}>
      {m.label}
    </span>
  );
}

function CheckCell({ value }) {
  return value
    ? <span className="flex justify-center"><Icon name="CheckCircle2" size={18} className="text-emerald-500" /></span>
    : <span className="flex justify-center"><Icon name="XCircle" size={18} className="text-slate-300" /></span>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPlanFeaturesPage() {
  const [search,     setSearch]     = useState('');
  const [filterCat,  setFilterCat]  = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');

  // Opciones de filtro dinámicas
  const categories = useMemo(() => {
    const cats = [...new Set(PLAN_FEATURES.map(f => f.category))].sort();
    return cats;
  }, []);

  // Features filtradas
  const filtered = useMemo(() => {
    return PLAN_FEATURES.filter(f => {
      if (filterCat !== 'all' && f.category !== filterCat) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      if (filterPlan !== 'all') {
        // filtra features que no están disponibles en ese plan
        if (!f.plans[filterPlan]) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!f.label.toLowerCase().includes(q) && !f.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, filterCat, filterStatus, filterPlan]);

  // KPIs
  const total      = PLAN_FEATURES.length;
  const active     = PLAN_FEATURES.filter(f => f.status === 'active').length;
  const planned    = PLAN_FEATURES.filter(f => f.status === 'planned').length;
  const onlyBiz    = PLAN_FEATURES.filter(f => !f.plans.starter && !f.plans.pro && f.plans.business).length;
  const proPlus    = PLAN_FEATURES.filter(f => !f.plans.starter && f.plans.pro).length;

  const kpis = [
    { label: 'Total funciones',   value: total,   icon: 'LayoutGrid',  color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
    { label: 'Activas',           value: active,  icon: 'CheckCircle2',color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'Próximas',          value: planned, icon: 'Clock',       color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
    { label: 'Solo Business',     value: onlyBiz, icon: 'Star',        color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'Pro+',              value: proPlus, icon: 'Zap',         color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funciones por plan</h1>
          <p className="mt-1 text-sm text-gray-500">
            Control comercial de capacidades disponibles en Starter, Pro y Business.
            Fuente de verdad: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/config/planFeatures.js</code>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
          <Icon name="Eye" size={13} />
          Solo lectura
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border p-4 flex items-center gap-3 ${k.bg}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-white/70 ${k.color}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{k.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Leyenda de planes */}
      <div className="flex flex-wrap gap-2">
        {PLANS.map(p => (
          <span key={p} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-full ${PLAN_META[p].dot}`} />
            {PLAN_META[p].label}
          </span>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        {Object.entries(STATUS_META).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${v.color}`}>{v.label}</span>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Buscar */}
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar función…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          />
        </div>

        {/* Categoría */}
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Estado */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="planned">Próximas</option>
          <option value="deprecated">Deprecadas</option>
        </select>

        {/* Plan mínimo */}
        <select
          value={filterPlan}
          onChange={e => setFilterPlan(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="all">Todos los planes</option>
          <option value="starter">Disponible en Starter</option>
          <option value="pro">Disponible en Pro</option>
          <option value="business">Disponible en Business</option>
        </select>

        {/* Reset */}
        {(search || filterCat !== 'all' || filterStatus !== 'all' || filterPlan !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterCat('all'); setFilterStatus('all'); setFilterPlan('all'); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            <Icon name="X" size={14} />
            Limpiar
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">{filtered.length} de {total}</span>
      </div>

      {/* Matriz */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide min-w-[200px]">Función</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Categoría</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600  text-xs uppercase tracking-wide w-24">Starter</th>
                <th className="text-center px-4 py-3 font-semibold text-purple-600 text-xs uppercase tracking-wide w-24">Pro</th>
                <th className="text-center px-4 py-3 font-semibold text-emerald-600 text-xs uppercase tracking-wide w-24">Business</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-28">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">¿Mostrar bloqueada?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Sin resultados para los filtros actuales</p>
                  </td>
                </tr>
              ) : filtered.map(feat => (
                <tr key={feat.id} className="hover:bg-gray-50/60 transition-colors">
                  {/* Función */}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 text-[13px]">{feat.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{feat.description}</p>
                    <p className="text-[10px] text-gray-300 font-mono mt-0.5">{feat.id}</p>
                  </td>

                  {/* Categoría */}
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                      {feat.category}
                    </span>
                  </td>

                  {/* Starter */}
                  <td className="px-4 py-3"><CheckCell value={feat.plans.starter} /></td>

                  {/* Pro */}
                  <td className="px-4 py-3"><CheckCell value={feat.plans.pro} /></td>

                  {/* Business */}
                  <td className="px-4 py-3"><CheckCell value={feat.plans.business} /></td>

                  {/* Estado */}
                  <td className="px-4 py-3">
                    <StatusBadge status={feat.status} />
                  </td>

                  {/* showLocked */}
                  <td className="px-4 py-3">
                    {feat.showLocked
                      ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium"><Icon name="Lock" size={10} />Bloqueada</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Icon name="EyeOff" size={10} />Oculta</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regla comercial */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const features = getFeaturesByPlan(plan);
          const m = PLAN_META[plan];
          return (
            <div key={plan} className={`rounded-2xl border p-4 space-y-2 ${
              plan === 'starter' ? 'bg-slate-50 border-slate-200' :
              plan === 'pro'     ? 'bg-purple-50 border-purple-200' :
                                   'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-3 h-3 rounded-full ${m.dot}`} />
                <h3 className="font-bold text-gray-900 text-sm">{m.label}</h3>
                <span className="ml-auto text-[11px] text-gray-400">{features.length} funciones</span>
              </div>
              <ul className="space-y-1">
                {features.filter(f => f.status === 'active').map(f => (
                  <li key={f.id} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                    <Icon name="Check" size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                    {f.label}
                  </li>
                ))}
                {features.filter(f => f.status === 'planned').length > 0 && (
                  <li className="pt-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                    Próximamente
                  </li>
                )}
                {features.filter(f => f.status === 'planned').map(f => (
                  <li key={f.id} className="flex items-start gap-1.5 text-[11px] text-gray-400 italic">
                    <Icon name="Clock" size={11} className="mt-0.5 flex-shrink-0" />
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Nota backend */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <Icon name="AlertTriangle" size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 space-y-1">
          <p className="font-bold">Validación backend pendiente (FASE 6)</p>
          <p>
            Las features que escriben datos sensibles (<code className="bg-amber-100 px-1 rounded">invoices</code>,{' '}
            <code className="bg-amber-100 px-1 rounded">customerAccount</code>,{' '}
            <code className="bg-amber-100 px-1 rounded">stockManagement</code>,{' '}
            <code className="bg-amber-100 px-1 rounded">aiAssistant</code>, etc.) deben validarse también en
            backend (Supabase Edge Function / RLS) cuando se salga de early-access.
            Mientras <code className="bg-amber-100 px-1 rounded">CRM_EARLY_ACCESS_MODE = true</code>, las
            verificaciones están desactivadas.
          </p>
        </div>
      </div>

    </div>
  );
}
