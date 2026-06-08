import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getAdminFunnel } from 'services/adminPaymentsService';

const STEPS = [
  { key: 'registros',           label: 'Registros',            icon: 'UserPlus',   color: '#6366F1' },
  { key: 'primer_producto',     label: 'Primer producto',       icon: 'Package',    color: '#0EA5E9' },
  { key: 'tres_productos',      label: '3+ productos',          icon: 'LayoutGrid', color: '#8B5CF6' },
  { key: 'catalogo_compartido', label: 'Catálogo visitado',     icon: 'Share2',     color: '#F59E0B' },
  { key: 'primer_pedido',       label: 'Primer pedido',         icon: 'ShoppingBag',color: '#10B981' },
];

function pct(a, b) {
  if (!b || b === 0) return null;
  return Math.round((a / b) * 100);
}

export default function AdminFunnelPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: d, error: e } = await getAdminFunnel();
      if (e) setError(e.message || 'Error al cargar embudo');
      else setData(d);
      setLoading(false);
    })();
  }, []);

  const steps = STEPS.map((s) => ({ ...s, value: data?.[s.key] ?? 0 }));
  const top = steps[0]?.value || 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {isDesktop && (
        <BusinessSidebar
          collapsed={sidebarCollapsed}
          onCollapse={setSidebarCollapsed}
          adminMode
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden" style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left 0.3s' }}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface" style={{ minHeight: 56 }}>
          {!isDesktop && (
            <button onClick={() => navigate('/admin/businesses')} className="p-1.5 rounded-lg hover:bg-muted">
              <Icon name="ArrowLeft" size={18} />
            </button>
          )}
          <Icon name="TrendingUp" size={18} color="var(--color-primary)" />
          <h1 className="text-base font-semibold">Embudo de activación</h1>
          <span className="ml-auto text-xs text-muted-foreground">Solo admin</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Icon name="Loader" size={16} className="animate-spin" />
              Cargando...
            </div>
          )}

          {error && (
            <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#DC2626' }}>
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="max-w-xl space-y-3">
              {steps.map((step, i) => {
                const prev = i > 0 ? steps[i - 1].value : null;
                const convFromPrev = pct(step.value, prev);
                const convFromTop = pct(step.value, top);

                return (
                  <div key={step.key} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: step.color + '1a' }}>
                        <Icon name={step.icon} size={15} color={step.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{step.label}</span>
                          <span className="text-2xl font-black tabular-nums" style={{ color: step.color, fontFamily: 'var(--font-stat)' }}>
                            {step.value.toLocaleString('es')}
                          </span>
                        </div>
                        {/* progress bar relative to registros */}
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${convFromTop ?? 100}%`, backgroundColor: step.color }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{convFromTop != null ? `${convFromTop}% del total` : '—'}</span>
                      {i > 0 && convFromPrev != null && (
                        <>
                          <span>·</span>
                          <span style={{ color: convFromPrev >= 50 ? '#10B981' : convFromPrev >= 25 ? '#F59E0B' : '#EF4444' }}>
                            {convFromPrev}% desde paso anterior
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* summary table */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden mt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Paso</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">N</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">% total</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Conversión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step, i) => {
                      const prev = i > 0 ? steps[i - 1].value : null;
                      return (
                        <tr key={step.key} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 font-medium">{step.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{step.value.toLocaleString('es')}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{pct(step.value, top) ?? '—'}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {i === 0 ? '—' : (pct(step.value, prev) != null ? `${pct(step.value, prev)}%` : '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                Datos en tiempo real · Fuente: tablas existentes (businesses, products, orders, catalog_visits)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
