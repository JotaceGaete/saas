import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import {
  getBusinessesForAdmin,
  getAdminStats,
  getAdminSuspiciousInfo,
  getDailyMessage,
  setDailyMessage,
} from 'services/waBusinessService';
import { getPlanLabel, getPlanColors, PLAN_SLUGS } from '../../constants/plans';
import { getPublicCatalogUrl } from '../../config/appUrl';
import { getCountryLabels } from '../../config/country';

const NEW_BIZ_MS = 24 * 60 * 60 * 1000;

// ── helpers ───────────────────────────────────────────────────────────────────

function isNew(createdAt) {
  return createdAt && Date.now() - new Date(createdAt).getTime() < NEW_BIZ_MS;
}

function isActivePaid(b) {
  const eff = b.effectivePlan || b.planSlug || 'starter';
  return eff !== 'starter' && !b.isTrial;
}

function isExpired(b) {
  const hasPaidPlan = (b.planSlug || 'starter') !== 'starter';
  const eff = b.effectivePlan || b.planSlug || 'starter';
  return hasPaidPlan && eff === 'starter' && !b.isTrial;
}

// visits30d === null means the migration hasn't run yet → don't filter on it
function hasNoVisits(b) {
  return b.visits30d !== null && b.visits30d === 0;
}

const SEGMENTS = [
  {
    key: 'all',
    label: 'Todos',
    icon: 'Store',
    color: 'var(--color-foreground)',
    bg: 'var(--color-muted)',
    match: () => true,
  },
  {
    key: 'new',
    label: 'Nuevos (24h)',
    icon: 'Sparkles',
    color: '#0EA5E9',
    bg: 'rgba(14,165,233,0.10)',
    match: (b) => isNew(b.createdAt),
  },
  {
    key: 'no_products',
    label: 'Sin productos',
    icon: 'PackageX',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.08)',
    match: (b) => (b.totalProducts ?? 0) === 0,
  },
  {
    key: 'no_visits',
    label: 'Sin visitas (30d)',
    icon: 'EyeOff',
    color: '#9333EA',
    bg: 'rgba(147,51,234,0.08)',
    match: (b) => hasNoVisits(b),
    unavailableMsg: 'Requiere migración 20260417000000',
  },
  {
    key: 'active_paid',
    label: 'Pago activo',
    icon: 'BadgeCheck',
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
    match: (b) => isActivePaid(b),
  },
  {
    key: 'trial',
    label: 'En trial',
    icon: 'Timer',
    color: '#D97706',
    bg: 'rgba(217,119,6,0.08)',
    match: (b) => !!b.isTrial,
  },
  {
    key: 'expired',
    label: 'Expirados',
    icon: 'AlertCircle',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    match: (b) => isExpired(b),
  },
];

// ── sub-components ────────────────────────────────────────────────────────────

function CountryCell({ countryCode }) {
  if (!countryCode) return <span style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', fontSize: 12 }}>—</span>;
  const labels = getCountryLabels(countryCode);
  return <span style={{ fontFamily: 'var(--font-caption)', fontSize: 12, whiteSpace: 'nowrap' }}>{labels.flag} {labels.countryName}</span>;
}

function PlanCell({ b }) {
  const eff    = b.effectivePlan || b.planSlug || 'starter';
  const colors = getPlanColors(eff);
  const label  = getPlanLabel(eff);
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-fit"
        style={{ backgroundColor: colors.bg, color: colors.color, fontFamily: 'var(--font-caption)' }}>
        {label}
      </span>
      {b.isTrial && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
          style={{ backgroundColor: 'rgba(217,119,6,0.10)', color: '#B45309', fontFamily: 'var(--font-caption)' }}>
          Trial
        </span>
      )}
      {isExpired(b) && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
          style={{ backgroundColor: 'rgba(107,114,128,0.10)', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
          Expirado
        </span>
      )}
      {b.planExpiresAt && isActivePaid(b) && (
        <span className="text-[10px] opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>
          hasta {new Date(b.planExpiresAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </div>
  );
}

function VisitsCell({ visits30d }) {
  if (visits30d === null || visits30d === undefined) {
    return <span className="text-xs opacity-30" style={{ fontFamily: 'var(--font-caption)' }}>—</span>;
  }
  const color = visits30d === 0 ? '#DC2626' : visits30d < 10 ? '#D97706' : '#059669';
  return (
    <span className="text-sm font-medium tabular-nums" style={{ color, fontFamily: 'var(--font-caption)' }}>
      {visits30d}
    </span>
  );
}

function SegmentChip({ seg, count, active, onClick, visitsAvailable }) {
  const unavailable = seg.key === 'no_visits' && !visitsAvailable;
  return (
    <button
      onClick={onClick}
      disabled={unavailable}
      title={unavailable ? seg.unavailableMsg : undefined}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: active ? seg.bg : 'transparent',
        color: active ? seg.color : 'var(--color-muted-foreground)',
        border: `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
        fontFamily: 'var(--font-caption)',
        boxShadow: active ? `0 0 0 1px ${seg.color}30` : 'none',
      }}
    >
      <Icon name={seg.icon} size={13} color={active ? seg.color : 'currentColor'} />
      {seg.label}
      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
        style={{ backgroundColor: active ? seg.color + '20' : 'var(--color-muted)', color: active ? seg.color : 'var(--color-muted-foreground)' }}>
        {count}
      </span>
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AdminBusinessesPage() {
  const navigate  = useNavigate();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1400);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [stats,      setStats]      = useState({ totalBusinesses: 0, totalProducts: 0, totalOrders: 0, byPlan: {} });
  const [businesses, setBusinesses] = useState([]);
  const [suspicious, setSuspicious] = useState({ multiBusinessUsers: [], demoBusinesses: [] });
  const [dailyMsg,       setDailyMsg]       = useState('');
  const [dailyMsgSaved,  setDailyMsgSaved]  = useState(false);
  const [dailyMsgSaving, setDailyMsgSaving] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // filters
  const [segment,       setSegment]       = useState('all');
  const [planFilter,    setPlanFilter]    = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [searchQ,       setSearchQ]       = useState('');
  const [sortKey,       setSortKey]       = useState('createdAt');
  const [sortDir,       setSortDir]       = useState('desc');

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [statsRes, listRes, suspRes, dailyMsgRes] = await Promise.all([
      getAdminStats(),
      getBusinessesForAdmin(),
      getAdminSuspiciousInfo(),
      getDailyMessage(),
    ]);
    if (statsRes?.error) setError(statsRes.error?.message || 'Error al cargar estadísticas');
    else if (statsRes?.data) setStats(statsRes.data);
    if (listRes?.error)  setError(prev => prev || listRes.error?.message || 'Error al cargar negocios');
    else if (listRes?.data) setBusinesses(listRes.data);
    if (suspRes?.data) setSuspicious(suspRes.data);
    if (dailyMsgRes?.data != null) setDailyMsg(dailyMsgRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // visits_30d is null in all businesses → migration not applied yet
  const visitsAvailable = useMemo(() => businesses.some(b => b.visits30d !== null), [businesses]);

  // segment counts (over ALL businesses, before plan/country/search)
  const segmentCounts = useMemo(() => {
    const out = {};
    for (const seg of SEGMENTS) {
      out[seg.key] = businesses.filter(seg.match).length;
    }
    return out;
  }, [businesses]);

  const availableCountries = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const b of businesses) {
      const code = b.countryCodeDb || null;
      if (code && !seen.has(code)) {
        seen.add(code);
        const labels = getCountryLabels(code);
        result.push({ code, flag: labels.flag, name: labels.countryName });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [businesses]);

  const segDef = SEGMENTS.find(s => s.key === segment) || SEGMENTS[0];

  const filteredBusinesses = useMemo(() => {
    const q = searchQ.toLowerCase();
    let list = businesses.filter(b => {
      if (!segDef.match(b)) return false;
      if (planFilter !== 'all' && (b.effectivePlan || b.planSlug) !== planFilter) return false;
      if (countryFilter !== 'all' && (b.countryCodeDb || null) !== countryFilter) return false;
      if (q && !b.name?.toLowerCase().includes(q) && !b.email?.toLowerCase().includes(q) && !b.slug?.toLowerCase().includes(q)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'name':        va = a.name?.toLowerCase() ?? ''; vb = b.name?.toLowerCase() ?? ''; break;
        case 'products':    va = a.totalProducts ?? 0; vb = b.totalProducts ?? 0; break;
        case 'visits30d':   va = a.visits30d ?? 0;   vb = b.visits30d ?? 0;   break;
        case 'orders':      va = a.ordersThisMonth ?? 0; vb = b.ordersThisMonth ?? 0; break;
        case 'createdAt':
        default:            va = new Date(a.createdAt || 0).getTime(); vb = new Date(b.createdAt || 0).getTime(); break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [businesses, segDef, planFilter, countryFilter, searchQ, sortKey, sortDir]);

  const multiUserIds = new Set((suspicious.multiBusinessUsers || []).map(u => u.userId));
  const demoIds      = new Set((suspicious.demoBusinesses || []).map(b => b.id));

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortHeader = ({ colKey, label, className = '' }) => (
    <th
      className={`px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 transition-colors ${className}`}
      onClick={() => handleSort(colKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon
          name={sortKey === colKey ? (sortDir === 'asc' ? 'ChevronUp' : 'ChevronDown') : 'ChevronsUpDown'}
          size={11}
          color={sortKey === colKey ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
        />
      </div>
    </th>
  );

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: 60 }}>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Negocios</h1>
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {loading ? 'Cargando…' : `${businesses.length} negocios en total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Actualizar">
              <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={15} color="var(--color-muted-foreground)"
                className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="Shield" size={14} color="var(--color-error)" />
              <span className="text-xs font-semibold hidden sm:inline" style={{ fontFamily: 'var(--font-caption)' }}>Solo admins</span>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-5" style={{ maxWidth: 1280 }}>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2"
              style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}

          {/* ── Estadísticas ── */}
          <section className="mb-5">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl border animate-pulse"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Negocios',  value: stats.totalBusinesses, icon: 'Store',         color: 'var(--color-primary)' },
                  { label: 'Productos', value: stats.totalProducts,   icon: 'Package',       color: '#0EA5E9' },
                  { label: 'Pedidos',   value: stats.totalOrders,     icon: 'ShoppingCart',  color: '#10B981' },
                  { label: 'Alertas',   value: (suspicious.multiBusinessUsers?.length ?? 0) + (suspicious.demoBusinesses?.length ?? 0), icon: 'AlertTriangle', color: '#D97706' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 px-4 py-4 rounded-xl border"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${s.color}18` }}>
                      <Icon name={s.icon} size={18} color={s.color} />
                    </div>
                    <div>
                      <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{s.value}</p>
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Alertas sospechosas ── */}
          {!loading && ((suspicious.multiBusinessUsers?.length ?? 0) + (suspicious.demoBusinesses?.length ?? 0)) > 0 && (
            <section className="mb-5">
              <div className="space-y-2">
                {(suspicious.multiBusinessUsers || []).map(u => (
                  <div key={u.userId} className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
                    style={{ borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.06)' }}>
                    <Icon name="Users" size={14} color="#D97706" />
                    <span style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      Usuario <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{u.userId?.slice(0, 8)}…</code> tiene <strong>{u.count}</strong> negocios
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#D97706' }}>Multi-negocio</span>
                  </div>
                ))}
                {(suspicious.demoBusinesses || []).map(b => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
                    style={{ borderColor: 'rgba(107,114,128,0.3)', backgroundColor: 'rgba(107,114,128,0.06)' }}>
                    <Icon name="TestTube" size={14} color="#6B7280" />
                    <span style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      <strong>{b.name}</strong> <span className="text-xs opacity-60">/{b.slug}</span> — parece demo/test
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#6B7280' }}>Demo</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Consejo del día ── */}
          <section className="mb-5">
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none select-none py-1"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-muted-foreground)', fontSize: 12 }}>
                <Icon name="ChevronRight" size={13} color="currentColor"
                  className="transition-transform group-open:rotate-90" />
                Consejo del día (mensaje broadcast)
              </summary>
              <div className="mt-2 px-4 py-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Se mostrará en el dashboard de todos los usuarios activos.
                </p>
                <textarea
                  value={dailyMsg}
                  onChange={e => { setDailyMsg(e.target.value); setDailyMsgSaved(false); }}
                  rows={3}
                  placeholder="Escribe un consejo, motivación o aviso..."
                  className="w-full text-sm rounded-lg border px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)', fontFamily: 'var(--font-body)', '--tw-ring-color': 'var(--color-primary)' }}
                />
                <div className="flex items-center justify-between mt-2">
                  {dailyMsgSaved
                    ? <span className="text-xs flex items-center gap-1" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}><Icon name="CheckCircle" size={13} color="#10B981" /> Guardado</span>
                    : <span />}
                  <div className="flex items-center gap-2">
                    {dailyMsg.trim() && (
                      <button onClick={() => { setDailyMsg(''); setDailyMsgSaved(false); }}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Limpiar
                      </button>
                    )}
                    <button
                      disabled={dailyMsgSaving}
                      onClick={async () => {
                        setDailyMsgSaving(true);
                        const res = await setDailyMessage(dailyMsg.trim());
                        setDailyMsgSaving(false);
                        if (res.ok) setDailyMsgSaved(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                    >
                      <Icon name={dailyMsgSaving ? 'Loader2' : 'Save'} size={12} color="#fff" className={dailyMsgSaving ? 'animate-spin' : ''} />
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </section>

          {/* ── Segmentos operacionales ── */}
          <section className="mb-4">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {SEGMENTS.map(seg => (
                <SegmentChip
                  key={seg.key}
                  seg={seg}
                  count={loading ? '…' : segmentCounts[seg.key] ?? 0}
                  active={segment === seg.key}
                  visitsAvailable={visitsAvailable}
                  onClick={() => { setSegment(seg.key); setPlanFilter('all'); setCountryFilter('all'); setSearchQ(''); }}
                />
              ))}
            </div>
            {segment === 'no_visits' && !visitsAvailable && (
              <p className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(147,51,234,0.06)', color: '#7C3AED', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Info" size={11} color="#7C3AED" className="inline mr-1" />
                Aplica la migración <code>20260417000000_admin_catalog_visits_overview.sql</code> para ver datos de visitas por negocio.
              </p>
            )}
          </section>

          {/* ── Tabla de negocios ── */}
          <section className="mb-8">
            {/* Filters row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-bold flex-shrink-0" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                {segment === 'all' ? 'Todos los negocios' : segDef.label}
                <span className="ml-1.5 font-normal opacity-50">({filteredBusinesses.length})</span>
              </h2>
              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {/* Plan filter (only meaningful on 'all' segment) */}
                {segment === 'all' && (
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {['all', ...PLAN_SLUGS].map(slug => (
                      <button
                        key={slug}
                        onClick={() => setPlanFilter(slug)}
                        className="px-2 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                        style={{
                          backgroundColor: planFilter === slug ? (slug === 'all' ? 'var(--color-primary)' : getPlanColors(slug).bg) : 'transparent',
                          color: planFilter === slug ? (slug === 'all' ? '#fff' : getPlanColors(slug).color) : 'var(--color-muted-foreground)',
                          border: `1px solid ${planFilter === slug ? 'transparent' : 'var(--color-border)'}`,
                          fontFamily: 'var(--font-caption)',
                        }}
                      >
                        {slug === 'all' ? 'Todos' : getPlanLabel(slug)}
                      </button>
                    ))}
                  </div>
                )}
                {availableCountries.length > 0 && (
                  <select
                    value={countryFilter}
                    onChange={e => setCountryFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border text-xs"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', outline: 'none', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
                  >
                    <option value="all">Todos los países</option>
                    {availableCountries.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Buscar nombre, email, slug…"
                  className="px-2.5 py-1.5 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', minWidth: 160, outline: 'none' }}
                />
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                {[1,2,3,4,5].map(i => <div key={i} className="h-14 border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }} />)}
              </div>
            ) : filteredBusinesses.length === 0 ? (
              <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <Icon name="Store" size={28} color="var(--color-muted-foreground)" />
                <p className="text-sm mt-3 font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {segment === 'all' ? 'No hay negocios que coincidan' : `No hay negocios en el segmento "${segDef.label}"`}
                </p>
                {segment !== 'all' && (
                  <button onClick={() => setSegment('all')} className="mt-2 text-xs underline"
                    style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                    Ver todos los negocios
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                    <thead>
                      <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                        <SortHeader colKey="name"      label="Negocio" />
                        <th className="px-3 py-2.5">Plan</th>
                        <th className="px-3 py-2.5 hidden md:table-cell">País</th>
                        <SortHeader colKey="products"  label="Productos" className="hidden sm:table-cell" />
                        <SortHeader colKey="visits30d" label="Visitas 30d" className="hidden sm:table-cell" />
                        <SortHeader colKey="orders"    label="Pedidos/mes" className="hidden xl:table-cell" />
                        <SortHeader colKey="createdAt" label="Creado" className="hidden md:table-cell" />
                        <th className="px-3 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: 'var(--color-foreground)' }}>
                      {filteredBusinesses.map(b => {
                        const isMulti  = multiUserIds.has(b.userId);
                        const isDemo   = demoIds.has(b.id);
                        const isNewBiz = isNew(b.createdAt);
                        const noProd   = (b.totalProducts ?? 0) === 0;
                        return (
                          <tr key={b.id}
                            className="border-b last:border-b-0 text-sm hover:bg-slate-50 transition-colors"
                            style={{
                              borderColor: 'var(--color-border)',
                              backgroundColor: isMulti || isDemo ? 'rgba(245,158,11,0.04)' : undefined,
                            }}
                          >
                            {/* Negocio */}
                            <td className="px-3 py-3 min-w-[180px]">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-sm truncate max-w-[200px]">{b.name || '—'}</span>
                                    {isNewBiz && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: 'rgba(14,165,233,0.12)', color: '#0284C7' }}>NUEVO</span>
                                    )}
                                    {noProd && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>SIN PRODS</span>
                                    )}
                                    {(isMulti || isDemo) && (
                                      <Icon name="AlertTriangle" size={12} color="#D97706" title={isMulti ? 'Multi-negocio' : 'Demo/test'} />
                                    )}
                                  </div>
                                  <p className="text-[11px] opacity-50 truncate">{b.slug || '—'}</p>
                                  {b.userEmail && <p className="text-[11px] opacity-40 truncate max-w-[200px]">{b.userEmail}</p>}
                                </div>
                              </div>
                            </td>
                            {/* Plan */}
                            <td className="px-3 py-3 min-w-[110px]">
                              <PlanCell b={b} />
                            </td>
                            {/* País */}
                            <td className="px-3 py-3 hidden md:table-cell">
                              <CountryCell countryCode={b.countryCodeDb} />
                            </td>
                            {/* Productos */}
                            <td className="px-3 py-3 hidden sm:table-cell">
                              <span className="font-medium tabular-nums">{b.activeProducts ?? b.totalProducts ?? '—'}</span>
                              {b.totalProducts != null && b.activeProducts != null && b.activeProducts !== b.totalProducts && (
                                <span className="text-xs opacity-40 ml-1">/{b.totalProducts}</span>
                              )}
                            </td>
                            {/* Visitas 30d */}
                            <td className="px-3 py-3 hidden sm:table-cell">
                              <VisitsCell visits30d={b.visits30d} />
                            </td>
                            {/* Pedidos/mes */}
                            <td className="px-3 py-3 hidden xl:table-cell tabular-nums">
                              {b.ordersThisMonth ?? '—'}
                            </td>
                            {/* Creado */}
                            <td className="px-3 py-3 hidden md:table-cell text-xs opacity-50">
                              {formatDate(b.createdAt)}
                            </td>
                            {/* Acciones */}
                            <td className="px-3 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                {b.slug && (
                                  <a
                                    href={getPublicCatalogUrl(b.slug)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium"
                                    style={{ color: 'var(--color-primary)' }}
                                  >
                                    Catálogo
                                    <Icon name="ExternalLink" size={11} color="var(--color-primary)" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/businesses/${b.id}`)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
                                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                                >
                                  <Icon name="Eye" size={12} />
                                  Ver
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="ArrowLeft" size={14} color="#fff" />
            Volver al dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
