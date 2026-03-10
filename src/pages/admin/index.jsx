import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getBusinessesForAdmin, getAdminStats } from 'services/waBusinessService';
import AdminRubrosSection from './components/AdminRubrosSection';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState({ totalBusinesses: 0, totalProducts: 0, totalOrders: 0 });
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [statsRes, listRes] = await Promise.all([getAdminStats(), getBusinessesForAdmin()]);
      if (cancelled) return;
      if (statsRes?.error) setError(statsRes.error?.message || 'Error al cargar estadísticas');
      else if (statsRes?.data) setStats(statsRes.data);
      if (listRes?.error) setError(listRes.error?.message || 'Error al cargar negocios');
      else if (listRes?.data) setBusinesses(listRes.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200" style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}>
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Panel de administración
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Estadísticas globales y listado de negocios
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
            <Icon name="Shield" size={16} color="var(--color-error)" />
            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)' }}>Solo administradores</span>
          </div>
        </div>

        <div className="p-4 md:p-6 lg:p-8 max-w-5xl pb-20 lg:pb-8">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={18} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}

          <section className="mb-8">
            <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Estadísticas
            </h2>
            {loading ? (
              <div className="flex gap-3 flex-wrap">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 w-40 rounded-xl border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-3 px-4 py-4 rounded-xl border min-w-0 flex-1 basis-40 sm:basis-auto sm:flex-initial sm:min-w-[160px]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                    <Icon name="Store" size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{stats.totalBusinesses}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Negocios</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-4 rounded-xl border min-w-0 flex-1 basis-40 sm:basis-auto sm:flex-initial sm:min-w-[160px]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                    <Icon name="Package" size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{stats.totalProducts}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-4 rounded-xl border min-w-0 flex-1 basis-40 sm:basis-auto sm:flex-initial sm:min-w-[160px]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                    <Icon name="ShoppingCart" size={20} color="#fff" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{stats.totalOrders}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pedidos</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Rubros y categorías
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Gestiona los rubros (sectores) y las categorías de cada uno. Los negocios eligen un rubro y solo ven las categorías de ese rubro en productos y catálogo.
            </p>
            <AdminRubrosSection />
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Listado de negocios
            </h2>
            {loading ? (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <div className="h-12 border-b" style={{ borderColor: 'var(--color-border)' }} />
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }} />
                ))}
              </div>
            ) : businesses.length === 0 ? (
              <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                No hay negocios registrados.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                    <thead>
                      <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Slug</th>
                        <th className="px-4 py-3">WhatsApp</th>
                        <th className="px-4 py-3">Activo</th>
                        <th className="px-4 py-3">Creado</th>
                        <th className="px-4 py-3 text-right">Catálogo</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: 'var(--color-foreground)' }}>
                      {businesses.map((b) => (
                        <tr key={b.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-4 py-3 font-medium">{b.name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{b.email || '—'}</td>
                          <td className="px-4 py-3 text-sm">{b.slug || '—'}</td>
                          <td className="px-4 py-3 text-sm">{b.whatsapp || '—'}</td>
                          <td className="px-4 py-3">{b.isActive ? 'Sí' : 'No'}</td>
                          <td className="px-4 py-3 text-sm">{formatDate(b.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            {b.slug ? (
                              <a
                                href={`/catalogo/${b.slug}`}
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium"
                                style={{ color: 'var(--color-primary)' }}
                              >
                                Ver catálogo
                                <Icon name="ExternalLink" size={14} color="var(--color-primary)" />
                              </a>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
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
