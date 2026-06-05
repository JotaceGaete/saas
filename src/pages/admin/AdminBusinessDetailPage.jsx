import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getBusinessesForAdmin, getPlanUsage } from 'services/waBusinessService';
import { adminChangePlan } from 'services/adminPaymentsService';
import { getPlanLabel, PLAN_SLUGS } from '../../constants/plans';
import { getPublicCatalogUrl } from '../../config/appUrl';
import { useAuth } from '../../contexts/AuthContext';

function PlanBadge({ slug }) {
  const label = getPlanLabel(slug);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(148,163,184,0.15)', color: '#111827', fontFamily: 'var(--font-caption)' }}>
      {label}
    </span>
  );
}

export default function AdminBusinessDetailPage() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { impersonateBusiness, stopImpersonation, isImpersonating } = useAuth();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1400);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [business, setBusiness] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [planChanging, setPlanChanging] = useState(false);
  const [newPlan, setNewPlan] = useState('');
  const [reason, setReason] = useState('');

  const formatDateTime = (d) =>
    d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const loadBusiness = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const listRes = await getBusinessesForAdmin();
      if (listRes?.error) {
        setError(listRes.error?.message || 'Error al cargar negocio');
        setLoading(false);
        return;
      }
      const all = listRes?.data || [];
      const found = all.find((b) => b.id === businessId);
      if (!found) {
        setError('Negocio no encontrado');
      } else {
        setBusiness(found);
        setNewPlan(found.effectivePlan || found.planSlug || 'starter');
      }
    } catch (e) {
      setError(e?.message || 'Error al cargar negocio');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const loadUsage = useCallback(async () => {
    if (!businessId) return;
    setUsageLoading(true);
    try {
      const res = await getPlanUsage(businessId);
      if (!res?.error) setUsage(res?.data || null);
    } finally {
      setUsageLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadBusiness();
    loadUsage();
  }, [loadBusiness, loadUsage]);

  const handleChangePlan = async (e) => {
    e?.preventDefault();
    if (!businessId || !newPlan) return;
    setPlanChanging(true);
    setError(null);
    try {
      const { error: changeErr } = await adminChangePlan(businessId, newPlan, reason || null);
      if (changeErr) {
        setError(changeErr.message || 'Error al cambiar plan');
      } else {
        await Promise.all([loadBusiness(), loadUsage()]);
      }
    } catch (err) {
      setError(err?.message || 'Error al cambiar plan');
    } finally {
      setPlanChanging(false);
    }
  };

  const handleGoBack = () => {
    navigate('/admin');
  };

  const catalogUrl = business?.slug ? getPublicCatalogUrl(business.slug) : null;

  const handleImpersonate = async () => {
    if (!business) return;
    await impersonateBusiness(business);
    navigate('/dashboard');
  };

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleGoBack}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <Icon name="ArrowLeft" size={16} color="var(--color-muted-foreground)" />
            </button>
            <div className="min-w-0">
              <h1
                className="text-base font-bold truncate"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
              >
                {business?.name || 'Negocio'}
              </h1>
              <p
                className="text-xs truncate"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                ID: <code>{businessId}</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {catalogUrl && (
              <a
                href={catalogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
              >
                <Icon name="ExternalLink" size={13} />
                Ver catálogo
              </a>
            )}
            <button
              type="button"
              onClick={handleImpersonate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
            >
              <Icon name="UserSwitch" size={13} />
              Entrar como
            </button>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '960px' }}>
          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2"
              style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}
            >
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>
                {error}
              </span>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="h-28 rounded-2xl border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />
              <div className="h-40 rounded-2xl border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />
            </div>
          ) : !business ? (
            <p
              className="text-sm"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              No se encontró el negocio.
            </p>
          ) : (
            <>
              {/* Resumen del negocio */}
              <section className="mb-5">
                <div className="rounded-2xl border px-4 py-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Negocio
                    </p>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {business.name || 'Sin nombre'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {business.slug ? `/${business.slug}` : 'Sin slug'} · {business.userEmail || 'Sin usuario asociado'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <PlanBadge slug={business.effectivePlan || business.planSlug || 'starter'} />
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Creado: {formatDateTime(business.createdAt)}
                    </p>
                    {business.planExpiresAt && (
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Plan vence: {formatDateTime(business.planExpiresAt)}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Uso del plan */}
              <section className="mb-5">
                <h2 className="text-sm font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                  Uso del plan
                </h2>
                <div className="rounded-2xl border px-4 py-4 sm:px-5 sm:py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  {usageLoading ? (
                    <p
                      className="text-sm"
                      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                    >
                      Cargando uso del plan…
                    </p>
                  ) : !usage ? (
                    <p
                      className="text-sm"
                      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                    >
                      No hay datos de uso disponibles.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                          Productos activos
                        </p>
                        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                          {usage.activeProducts ?? 0}
                          {usage.maxProducts != null && (
                            <span className="text-sm font-normal" style={{ color: 'var(--color-muted-foreground)' }}>
                              {' '}
                              / {usage.maxProducts}
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                          Pedidos este mes
                        </p>
                        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                          {usage.ordersThisMonth ?? 0}
                          {usage.maxOrdersPerMonth != null && (
                            <span className="text-sm font-normal" style={{ color: 'var(--color-muted-foreground)' }}>
                              {' '}
                              / {usage.maxOrdersPerMonth}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Cambio de plan */}
              <section className="mb-8">
                <h2 className="text-sm font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                  Cambiar plan
                </h2>
                <form
                  onSubmit={handleChangePlan}
                  className="rounded-2xl border px-4 py-4 sm:px-5 sm:py-4 space-y-3"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Nuevo plan
                      </label>
                      <select
                        value={newPlan}
                        onChange={(e) => setNewPlan(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                      >
                        {PLAN_SLUGS.map((slug) => (
                          <option key={slug} value={slug}>
                            {getPlanLabel(slug)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Motivo (opcional)
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: soporte, corrección de pago, promo…"
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Al cambiar a Starter se limpiará la fecha de vencimiento y se aplicarán los límites del plan.
                    </p>
                    <button
                      type="submit"
                      disabled={planChanging}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                    >
                      {planChanging ? (
                        <>
                          <span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin border-white" />
                          Guardando…
                        </>
                      ) : (
                        <>
                          <Icon name="Save" size={14} color="#FFFFFF" />
                          Guardar cambio
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

