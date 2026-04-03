import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getBusinessesForAdmin, getAdminStats, getAdminSuspiciousInfo } from 'services/waBusinessService';
import AdminRubrosSection from './components/AdminRubrosSection';
import { getPlanLabel, getPlanColors, PLAN_SLUGS } from '../../constants/plans';
import { getPublicCatalogUrl } from '../../config/appUrl';
import { getCountryLabels } from '../../config/country';

const PLAN_ICON = { starter: 'User', pro: 'Star', business: 'Building' };

function CountryCell({ countryCode }) {
  if (!countryCode) {
    return <span style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', fontSize: '12px' }}>Sin país</span>;
  }
  const labels = getCountryLabels(countryCode);
  return (
    <span style={{ fontFamily: 'var(--font-caption)', fontSize: '12px', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
      {labels.flag} {labels.countryName}
    </span>
  );
}

function PlanBadge({ slug }) {
  const label  = getPlanLabel(slug);
  const colors = getPlanColors(slug);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.color, fontFamily: 'var(--font-caption)' }}>
      {label}
    </span>
  );
}

export default function AdminDashboard() {
  const navigate   = useNavigate();
  const isDesktop  = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [stats,     setStats]     = useState({ totalBusinesses: 0, totalProducts: 0, totalOrders: 0, byPlan: {} });
  const [businesses, setBusinesses] = useState([]);
  const [suspicious, setSuspicious] = useState({ multiBusinessUsers: [], demoBusinesses: [] });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [planFilter,    setPlanFilter]    = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [searchQ,       setSearchQ]       = useState('');

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [statsRes, listRes, suspRes] = await Promise.all([
      getAdminStats(),
      getBusinessesForAdmin(),
      getAdminSuspiciousInfo(),
    ]);
    if (statsRes?.error) setError(statsRes.error?.message || 'Error al cargar estadísticas');
    else if (statsRes?.data) setStats(statsRes.data);
    if (listRes?.error)  setError(prev => prev || listRes.error?.message || 'Error al cargar negocios');
    else if (listRes?.data) setBusinesses(listRes.data);
    if (suspRes?.data) setSuspicious(suspRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableCountries = React.useMemo(() => {
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

  const filteredBusinesses = businesses.filter(b => {
    const matchPlan    = planFilter === 'all' || (b.effectivePlan || b.planSlug) === planFilter;
    const matchCountry = countryFilter === 'all' || (b.countryCodeDb || null) === countryFilter;
    const q = searchQ.toLowerCase();
    const matchSearch  = !q || b.name?.toLowerCase().includes(q) || b.email?.toLowerCase().includes(q) || b.slug?.toLowerCase().includes(q);
    return matchPlan && matchCountry && matchSearch;
  });

  const multiUserIds = new Set((suspicious.multiBusinessUsers || []).map(u => u.userId));
  const demoIds      = new Set((suspicious.demoBusinesses || []).map(b => b.id));

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Panel de administración</h1>
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Control global de negocios y planes</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Actualizar">
              <Icon name="RefreshCw" size={15} color="var(--color-muted-foreground)" />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="Shield" size={14} color="var(--color-error)" />
              <span className="text-xs font-semibold hidden sm:inline" style={{ fontFamily: 'var(--font-caption)' }}>Solo admins</span>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '1200px' }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}

          {/* ── Estadísticas globales ── */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Estadísticas globales</h2>
              <div className="flex items-center gap-2">
              <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90" style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Users" size={13} color="var(--color-primary)" />
                Usuarios
              </button>
              <button onClick={() => navigate('/admin/payments')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90" style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="CreditCard" size={13} color="var(--color-primary)" />
                Pagos
              </button>
              <button onClick={() => navigate('/admin/audit-log')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90" style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="ClipboardList" size={13} color="var(--color-primary)" />
                Auditoría
              </button>
              <button onClick={() => navigate('/admin/emails')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90" style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Mail" size={13} color="var(--color-primary)" />
                Emails
              </button>
            </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Negocios', value: stats.totalBusinesses, icon: 'Store', color: 'var(--color-primary)' },
                  { label: 'Productos', value: stats.totalProducts,  icon: 'Package', color: '#0EA5E9' },
                  { label: 'Pedidos',   value: stats.totalOrders,    icon: 'ShoppingCart', color: '#10B981' },
                  { label: 'Alertas',   value: (suspicious.multiBusinessUsers?.length ?? 0) + (suspicious.demoBusinesses?.length ?? 0), icon: 'AlertTriangle', color: '#D97706' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 px-4 py-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.color}18` }}>
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

          {/* ── Distribución por plan ── */}
          <section className="mb-6">
            <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Distribución por plan</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PLAN_SLUGS.map(slug => {
                const colors = getPlanColors(slug);
                const cnt    = stats.byPlan?.[slug] ?? 0;
                const total  = stats.totalBusinesses || 1;
                const pct    = Math.round((cnt / total) * 100);
                return (
                  <div key={slug} className="flex flex-col gap-2 px-4 py-3 rounded-xl border" style={{ borderColor: colors.bg, backgroundColor: '#fff' }}>
                    <div className="flex items-center justify-between">
                      <PlanBadge slug={slug} />
                      <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: colors.color }}>{cnt}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors.color }} />
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{pct}% del total</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Alertas antiabuso ── */}
          {!loading && ((suspicious.multiBusinessUsers?.length ?? 0) + (suspicious.demoBusinesses?.length ?? 0)) > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)', color: '#D97706' }}>
                <Icon name="AlertTriangle" size={15} color="#D97706" />
                Alertas de uso sospechoso
              </h2>
              <div className="space-y-2">
                {(suspicious.multiBusinessUsers || []).map(u => (
                  <div key={u.userId} className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm" style={{ borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.06)' }}>
                    <Icon name="Users" size={14} color="#D97706" />
                    <span style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      Usuario <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{u.userId?.slice(0, 8)}…</code> tiene <strong>{u.count}</strong> negocios registrados
                    </span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#D97706' }}>Multi-negocio</span>
                  </div>
                ))}
                {(suspicious.demoBusinesses || []).map(b => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm" style={{ borderColor: 'rgba(107,114,128,0.3)', backgroundColor: 'rgba(107,114,128,0.06)' }}>
                    <Icon name="TestTube" size={14} color="#6B7280" />
                    <span style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                      <strong>{b.name}</strong> <span className="text-xs opacity-60">/{b.slug}</span> — parece demo/test
                    </span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#6B7280' }}>Demo</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Rubros ── */}
          <section className="mb-6">
            <h2 className="text-sm font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Rubros y categorías</h2>
            <AdminRubrosSection />
          </section>

          {/* ── Listado de negocios ── */}
          <section className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Negocios ({filteredBusinesses.length})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filtro por plan */}
                <div className="flex items-center gap-1 overflow-x-auto">
                  {['all', ...PLAN_SLUGS].map(slug => (
                    <button
                      key={slug}
                      onClick={() => setPlanFilter(slug)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
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
                {/* Filtro por país */}
                {availableCountries.length > 0 && (
                  <select
                    value={countryFilter}
                    onChange={e => setCountryFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', outline: 'none', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
                  >
                    <option value="all">Todos los países</option>
                    {availableCountries.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                )}
                {/* Buscador */}
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Buscar..."
                  className="px-3 py-1.5 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', minWidth: 140, outline: 'none' }}
                />
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                {[1,2,3,4].map(i => <div key={i} className="h-14 border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }} />)}
              </div>
            ) : filteredBusinesses.length === 0 ? (
              <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                No hay negocios que coincidan.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                    <thead>
                      <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                        <th className="px-3 py-2.5">Negocio</th>
                        <th className="px-3 py-2.5">Plan</th>
                        <th className="px-3 py-2.5 hidden md:table-cell">País</th>
                        <th className="px-3 py-2.5 hidden sm:table-cell">Productos</th>
                        <th className="px-3 py-2.5 hidden sm:table-cell">Pedidos / mes</th>
                        <th className="px-3 py-2.5 hidden md:table-cell">Creado</th>
                        <th className="px-3 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: 'var(--color-foreground)' }}>
                      {filteredBusinesses.map(b => {
                        const isMulti = multiUserIds.has(b.userId);
                        const isDemo  = demoIds.has(b.id);
                        const eff     = b.effectivePlan || b.planSlug || 'starter';
                        return (
                          <tr
                            key={b.id}
                            className="border-b last:border-b-0 text-sm"
                            style={{
                              borderColor: 'var(--color-border)',
                              backgroundColor: isMulti || isDemo ? 'rgba(245,158,11,0.04)' : 'transparent',
                            }}
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="font-semibold text-sm">{b.name || '—'}</p>
                                  <p className="text-xs opacity-60">{b.slug || '—'}</p>
                                  {b.userEmail && <p className="text-xs opacity-50">{b.userEmail}</p>}
                                </div>
                                {(isMulti || isDemo) && (
                                  <Icon name="AlertTriangle" size={13} color="#D97706" title={isMulti ? 'Multi-negocio' : 'Demo/test'} />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1">
                                <PlanBadge slug={eff} />
                                {b.planSlug !== eff && (
                                  <span className="text-xs opacity-50">(era {getPlanLabel(b.planSlug)})</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell">
                              <CountryCell countryCode={b.countryCodeDb} />
                            </td>
                            <td className="px-3 py-3 hidden sm:table-cell">
                              <span className="font-medium">{b.activeProducts ?? b.totalProducts ?? '—'}</span>
                              {b.totalProducts != null && b.activeProducts != null && b.activeProducts !== b.totalProducts && (
                                <span className="text-xs opacity-50 ml-1">/{b.totalProducts}</span>
                              )}
                            </td>
                            <td className="px-3 py-3 hidden sm:table-cell">
                              {b.ordersThisMonth ?? '—'}
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell text-xs opacity-60">
                              {formatDate(b.createdAt)}
                            </td>
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
                                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
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
