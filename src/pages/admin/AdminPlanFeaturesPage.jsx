import React, { useState, useMemo } from 'react';
import Icon from 'components/AppIcon';
import {
  PLAN_FEATURES,
  getFeaturesByPlan,
} from 'config/planFeatures';

// ── Meta de planes ─────────────────────────────────────────────────────────

const PLANS = ['starter', 'pro', 'business'];

const PLAN_META = {
  starter:  {
    label: 'Starter',
    sublabel: 'Gratis',
    color: 'bg-slate-100 text-slate-700',
    badgeBg: 'bg-slate-100',
    border: 'border-slate-200',
    header: 'bg-slate-50',
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    iconColor: 'text-slate-400',
    icon: 'Package',
  },
  pro: {
    label: 'Pro',
    sublabel: 'Pago',
    color: 'bg-purple-100 text-purple-700',
    badgeBg: 'bg-purple-100',
    border: 'border-purple-200',
    header: 'bg-purple-50',
    dot: 'bg-purple-500',
    text: 'text-purple-700',
    iconColor: 'text-purple-400',
    icon: 'Zap',
  },
  business: {
    label: 'Business',
    sublabel: 'Full',
    color: 'bg-emerald-100 text-emerald-700',
    badgeBg: 'bg-emerald-100',
    border: 'border-emerald-200',
    header: 'bg-emerald-50',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    iconColor: 'text-emerald-500',
    icon: 'Star',
  },
};

const STATUS_META = {
  active:     { label: 'Activa',    color: 'bg-green-100 text-green-700',  icon: 'CheckCircle2' },
  planned:    { label: 'Próxima',   color: 'bg-amber-100 text-amber-700',  icon: 'Clock' },
  deprecated: { label: 'Deprecada', color: 'bg-red-100   text-red-700',    icon: 'AlertCircle' },
};

const CATEGORY_ICONS = {
  'Catálogo':       'Globe',
  'Ventas':         'ShoppingCart',
  'Clientes':       'Users',
  'Inventario':     'Package',
  'Finanzas':       'TrendingUp',
  'IA':             'Sparkles',
  'Reportes':       'BarChart2',
  'Administración': 'Settings',
  'Personalización':'Palette',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function PlanChip({ plan }) {
  const m = PLAN_META[plan];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function StatusChip({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.color}`}>
      <Icon name={m.icon} size={9} />
      {m.label}
    </span>
  );
}

function CheckCell({ value }) {
  return value
    ? <span className="flex justify-center"><Icon name="CheckCircle2" size={18} className="text-emerald-500" /></span>
    : <span className="flex justify-center"><Icon name="Minus" size={16} className="text-slate-200" /></span>;
}

// ── Vista matriz ───────────────────────────────────────────────────────────

function MatrixView({ features }) {
  const byCategory = useMemo(() => {
    const map = {};
    features.forEach(f => {
      if (!map[f.category]) map[f.category] = [];
      map[f.category].push(f);
    });
    return map;
  }, [features]);

  if (features.length === 0) {
    return (
      <div className="text-center py-14 text-gray-400">
        <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Sin resultados para los filtros actuales</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide min-w-[220px]">
                Función
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                Plan mínimo
              </th>
              <th className="text-center px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide w-24">
                Starter
              </th>
              <th className="text-center px-4 py-3 font-semibold text-purple-600 text-xs uppercase tracking-wide w-20">
                Pro
              </th>
              <th className="text-center px-4 py-3 font-semibold text-emerald-600 text-xs uppercase tracking-wide w-24">
                Business
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide w-28">
                Estado
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide w-28">
                Visible si bloqueada
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(byCategory).map(([cat, items]) => (
              <React.Fragment key={cat}>
                {/* Category row */}
                <tr className="bg-gray-50/80">
                  <td colSpan={7} className="px-4 py-2">
                    <span className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                      <Icon name={CATEGORY_ICONS[cat] ?? 'Folder'} size={12} />
                      {cat}
                    </span>
                  </td>
                </tr>
                {/* Feature rows */}
                {items.map(feat => {
                  const minPlan = PLANS.find(p => feat.plans[p] === true) ?? 'business';
                  return (
                    <tr key={feat.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Función */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 text-[13px]">{feat.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug max-w-xs">{feat.description}</p>
                        <p className="text-[10px] text-gray-300 font-mono mt-0.5">{feat.id}</p>
                      </td>

                      {/* Plan mínimo */}
                      <td className="px-4 py-3">
                        <PlanChip plan={minPlan} />
                      </td>

                      {/* Checks */}
                      <td className="px-4 py-3"><CheckCell value={feat.plans.starter} /></td>
                      <td className="px-4 py-3"><CheckCell value={feat.plans.pro} /></td>
                      <td className="px-4 py-3"><CheckCell value={feat.plans.business} /></td>

                      {/* Estado */}
                      <td className="px-4 py-3"><StatusChip status={feat.status} /></td>

                      {/* showLocked */}
                      <td className="px-4 py-3">
                        {feat.showLocked
                          ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                              <Icon name="Lock" size={10} />Bloqueada
                            </span>
                          : <span className="inline-flex items-center gap-1 text-[11px] text-gray-300">
                              <Icon name="EyeOff" size={10} />Oculta
                            </span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vista comercial ────────────────────────────────────────────────────────

function CommercialView() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {PLANS.map(plan => {
        const m = PLAN_META[plan];
        const allFeatures  = getFeaturesByPlan(plan);
        const activeOnes   = allFeatures.filter(f => f.status === 'active');
        const plannedOnes  = allFeatures.filter(f => f.status === 'planned');

        // Features exclusivas (no en el plan anterior)
        const prevPlan  = PLANS[PLANS.indexOf(plan) - 1];
        const exclusive = prevPlan
          ? activeOnes.filter(f => !f.plans[prevPlan])
          : activeOnes;

        const byCategory = {};
        activeOnes.forEach(f => {
          if (!byCategory[f.category]) byCategory[f.category] = [];
          byCategory[f.category].push(f);
        });

        return (
          <div key={plan} className={`rounded-2xl border-2 ${m.border} overflow-hidden`}>
            {/* Header */}
            <div className={`px-5 py-4 ${m.header} border-b ${m.border}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon name={m.icon} size={18} className={m.iconColor} />
                  <h3 className={`font-bold text-base ${m.text}`}>{m.label}</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.color}`}>{m.sublabel}</span>
                </div>
              </div>
              <div className="flex gap-3 text-[11px] text-gray-500 mt-2">
                <span><strong className="text-gray-700">{activeOnes.length}</strong> activas</span>
                {plannedOnes.length > 0 && <span><strong className="text-gray-500">{plannedOnes.length}</strong> próximas</span>}
                {exclusive.length > 0 && prevPlan && (
                  <span className={`font-semibold ${m.text}`}>+{exclusive.length} vs {PLAN_META[prevPlan].label}</span>
                )}
              </div>
            </div>

            {/* Features por categoría */}
            <div className="p-4 space-y-3 bg-white">
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Icon name={CATEGORY_ICONS[cat] ?? 'Folder'} size={10} />
                    {cat}
                  </p>
                  <ul className="space-y-1">
                    {items.map(f => {
                      const isExclusive = prevPlan && !f.plans[prevPlan];
                      return (
                        <li key={f.id} className="flex items-start gap-2">
                          <Icon
                            name={isExclusive ? 'Plus' : 'Check'}
                            size={11}
                            className={`mt-0.5 flex-shrink-0 ${isExclusive ? m.iconColor : 'text-gray-300'}`}
                          />
                          <div>
                            <span className={`text-[12px] ${isExclusive ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                              {f.label}
                            </span>
                            {isExclusive && (
                              <p className="text-[10px] text-gray-400 leading-tight">{f.salesPitch}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {/* Próximas */}
              {plannedOnes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1 mt-3 flex items-center gap-1">
                    <Icon name="Clock" size={10} />
                    Próximamente
                  </p>
                  <ul className="space-y-0.5">
                    {plannedOnes.map(f => (
                      <li key={f.id} className="flex items-center gap-2 text-[11px] text-gray-300 italic">
                        <Icon name="Clock" size={10} className="flex-shrink-0" />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPlanFeaturesPage() {
  const [view,         setView]         = useState('matrix');   // 'matrix' | 'commercial'
  const [search,       setSearch]       = useState('');
  const [filterCat,    setFilterCat]    = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan,   setFilterPlan]   = useState('all');

  const categories = useMemo(() => [...new Set(PLAN_FEATURES.map(f => f.category))], []);

  const filtered = useMemo(() => {
    return PLAN_FEATURES.filter(f => {
      if (filterCat !== 'all' && f.category !== filterCat) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      if (filterPlan !== 'all' && !f.plans[filterPlan]) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!f.label.toLowerCase().includes(q) &&
            !f.id.toLowerCase().includes(q) &&
            !f.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, filterCat, filterStatus, filterPlan]);

  // ── KPIs ──
  const total       = PLAN_FEATURES.length;
  const active      = PLAN_FEATURES.filter(f => f.status === 'active').length;
  const planned     = PLAN_FEATURES.filter(f => f.status === 'planned').length;

  const starterCt   = getFeaturesByPlan('starter').filter(f => f.status === 'active').length;
  const proCt       = getFeaturesByPlan('pro').filter(f => f.status === 'active').length;
  const bizCt       = getFeaturesByPlan('business').filter(f => f.status === 'active').length;

  const exclusivePro = PLAN_FEATURES.filter(
    f => f.status === 'active' && !f.plans.starter && f.plans.pro
  ).length;
  const exclusiveBiz = PLAN_FEATURES.filter(
    f => f.status === 'active' && !f.plans.starter && !f.plans.pro && f.plans.business
  ).length;

  const kpis = [
    { label: 'Total funciones',       value: total,       icon: 'LayoutGrid',   color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
    { label: 'Starter (activas)',      value: starterCt,   icon: 'Package',      color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
    { label: 'Pro (activas)',          value: proCt,       icon: 'Zap',          color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200' },
    { label: 'Business (activas)',     value: bizCt,       icon: 'Star',         color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'Exclusivas Pro',         value: exclusivePro,icon: 'PlusCircle',   color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200' },
    { label: 'Exclusivas Business',    value: exclusiveBiz,icon: 'Award',        color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'Activas',               value: active,      icon: 'CheckCircle2', color: 'text-green-600',   bg: 'bg-green-50 border-green-200' },
    { label: 'Próximas',              value: planned,     icon: 'Clock',        color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funciones por plan</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fuente de verdad comercial · Qué incluye Starter, Pro y Business.{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/config/planFeatures.js</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <Icon name="Eye" size={13} />
            Solo lectura
          </span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border p-3 flex flex-col gap-1 ${k.bg}`}>
            <div className={`${k.color}`}>
              <Icon name={k.icon} size={16} />
            </div>
            <p className="text-xl font-bold text-gray-900 leading-none">{k.value}</p>
            <p className="text-[10px] text-gray-500 leading-tight">{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Notas comerciales ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            plan: 'starter',
            note: 'El Starter debe generar valor inmediato. Catálogo, ventas básicas, stock y caja son suficientes para que el usuario "descubra" Ventalink.',
          },
          {
            plan: 'pro',
            note: 'Pro es el tier de conversión principal. Desbloquea las funciones que los negocios activos necesitan: facturas, cuenta corriente, etiquetas, tickets.',
          },
          {
            plan: 'business',
            note: 'Business justifica precio por escala y control. Múltiples usuarios, automatizaciones, reportes avanzados, exportaciones y marca blanca.',
          },
        ].map(({ plan, note }) => {
          const m = PLAN_META[plan];
          return (
            <div key={plan} className={`rounded-xl border ${m.border} p-3 ${m.header}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon name={m.icon} size={14} className={m.iconColor} />
                <span className={`text-xs font-bold ${m.text}`}>{m.label}</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">{note}</p>
            </div>
          );
        })}
      </div>

      {/* ── Tabs de vista ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'matrix',     label: 'Matriz técnica',  icon: 'Table' },
          { id: 'commercial', label: 'Vista comercial', icon: 'Briefcase' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={[
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
              view === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon name={tab.icon} size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Vista Comercial ── */}
      {view === 'commercial' && <CommercialView />}

      {/* ── Vista Matriz ── */}
      {view === 'matrix' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, id o descripción…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>

            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="all">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

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

            <select
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="all">Todos los planes</option>
              <option value="starter">En Starter</option>
              <option value="pro">En Pro</option>
              <option value="business">En Business</option>
            </select>

            {(search || filterCat !== 'all' || filterStatus !== 'all' || filterPlan !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilterCat('all'); setFilterStatus('all'); setFilterPlan('all'); }}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
              >
                <Icon name="X" size={14} />
                Limpiar
              </button>
            )}

            <span className="text-xs text-gray-400 ml-auto">{filtered.length} de {total}</span>
          </div>

          <MatrixView features={filtered} />
        </>
      )}

      {/* ── Nota CAMBIO 5 ── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Icon name="Info" size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-bold">Nota: nombre del Termómetro del negocio (CAMBIO 5)</p>
          <p>El módulo de rentabilidad diaria ahora se llama <strong>Salud financiera</strong>.</p>
          <p className="text-blue-600">Alternativas evaluadas: "Estado del negocio" · "¿Estoy ganando dinero?" · "Radar financiero"</p>
        </div>
      </div>

      {/* ── Nota backend ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <Icon name="AlertTriangle" size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 space-y-1">
          <p className="font-bold">Validación backend pendiente (FASE 6)</p>
          <p>
            Features que escriben datos sensibles deben validarse también en Supabase Edge Function / RLS.
            Activo cuando <code className="bg-amber-100 px-1 rounded">CRM_EARLY_ACCESS_MODE = false</code>.
          </p>
        </div>
      </div>

    </div>
  );
}
