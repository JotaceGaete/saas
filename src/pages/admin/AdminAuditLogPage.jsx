import React, { useEffect, useState, useCallback } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import { getAdminAuditLog } from 'services/adminPaymentsService';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAuditLogPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
    adminUserId: '',
    entityId: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const opts = {
      ...filters,
      limit,
      offset: page * limit,
    };
    const res = await getAdminAuditLog(opts);
    if (res.error) {
      setError(res.error?.message || 'Error al cargar auditoría');
      setRows([]);
      setTotal(0);
    } else {
      setRows(res.data || []);
      setTotal(res.total ?? 0);
    }
    setLoading(false);
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChangeFilter = (field, value) => {
    setPage(0);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-40 border-b px-4 md:px-6 lg:pl-4 lg:pr-8 py-4 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Volver al panel admin"
            >
              <Icon name="ArrowLeft" size={18} color="var(--color-muted-foreground)" />
            </button>
            <div>
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Auditoría admin
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Cambios de plan, extensiones y otras acciones manuales
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
            style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="RefreshCw" size={14} />
            Actualizar
          </button>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-8 py-6" style={{ maxWidth: '1100px' }}>
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

          {/* Filtros */}
          <section className="mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  Tipo de entidad
                </label>
                <select
                  value={filters.entityType}
                  onChange={(e) => handleChangeFilter('entityType', e.target.value)}
                  className="px-3 py-2 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  <option value="">Todas</option>
                  <option value="business">Business</option>
                  <option value="payment">Payment</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  Acción
                </label>
                <input
                  type="text"
                  value={filters.action}
                  onChange={(e) => handleChangeFilter('action', e.target.value)}
                  placeholder="Ej: change_plan, extend_plan"
                  className="px-3 py-2 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  ID entidad
                </label>
                <input
                  type="text"
                  value={filters.entityId}
                  onChange={(e) => handleChangeFilter('entityId', e.target.value)}
                  placeholder="UUID de negocio/pago"
                  className="px-3 py-2 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  Admin user id
                </label>
                <input
                  type="text"
                  value={filters.adminUserId}
                  onChange={(e) => handleChangeFilter('adminUserId', e.target.value)}
                  placeholder="UUID admin"
                  className="px-3 py-2 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
            </div>
          </section>

          {/* Tabla */}
          <section>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-muted text-[11px] font-semibold" style={{ color: 'var(--color-muted-foreground)' }}>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Acción</th>
                      <th className="px-3 py-2 text-left">Entidad</th>
                      <th className="px-3 py-2 text-left">Admin</th>
                      <th className="px-3 py-2 text-left">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                          Cargando registros…
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                          No hay registros que coincidan con los filtros.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id} className="border-t text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                          <td className="px-3 py-2">
                            <code className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{r.action}</code>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="uppercase text-[10px] opacity-70">{r.entity_type}</span>
                              <code className="text-[10px] break-all">{r.entity_id}</code>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <code className="text-[10px] break-all">{r.admin_user_id}</code>
                          </td>
                          <td className="px-3 py-2">
                            {r.payload ? (
                              <pre className="max-h-24 overflow-auto bg-muted rounded p-1 text-[10px]">
                                {JSON.stringify(r.payload, null, 2)}
                              </pre>
                            ) : (
                              <span className="text-[10px] opacity-60">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Paginación simple */}
              <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Página {page + 1} de {totalPages} · {total} registros
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2 py-1 rounded border text-[11px] disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                    disabled={page + 1 >= totalPages}
                    className="px-2 py-1 rounded border text-[11px] disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

