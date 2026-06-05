import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { listAdminUsers } from 'services/adminUsersService';
import { getPlanLabel, getPlanColors } from 'constants/plans';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PlanBadge({ slug }) {
  if (!slug) return null;
  const { color, bg } = getPlanColors(slug);
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: bg, color, fontFamily: 'var(--font-caption)' }}>
      {getPlanLabel(slug)}
    </span>
  );
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1400);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQ, setSearchQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await listAdminUsers({ page: 1, per_page: 100 });
    if (err) setError(err.message);
    else if (data?.users) setUsers(data.users);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    const q = searchQ.toLowerCase().trim();
    if (!q) return true;
    return (u.email ?? '').toLowerCase().includes(q) || (u.id ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Usuarios</h1>
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Listado y gestión de usuarios</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/admin')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-opacity hover:opacity-90" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="ArrowLeft" size={13} />
              Panel admin
            </button>
            <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Actualizar">
              <Icon name="RefreshCw" size={15} color="var(--color-muted-foreground)" />
            </button>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '1200px' }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar por email o ID..."
              className="px-3 py-1.5 rounded-lg border text-sm"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', minWidth: 200, outline: 'none' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {filtered.length} usuario(s)
            </span>
          </div>

          {loading ? (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              No hay usuarios que coincidan.
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                  <thead>
                    <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                      <th className="px-3 py-2.5">Usuario</th>
                      <th className="px-3 py-2.5">Estado</th>
                      <th className="px-3 py-2.5">Rol</th>
                      <th className="px-3 py-2.5 hidden sm:table-cell">Plan / Trial</th>
                      <th className="px-3 py-2.5 hidden md:table-cell">Creado</th>
                      <th className="px-3 py-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--color-foreground)' }}>
                    {filtered.map((u) => {
                      const banned = u.banned_until && new Date(u.banned_until) > new Date();
                      const biz = (u.businesses && u.businesses[0]) || null;
                      const planSlug = biz?.plan_slug ?? 'starter';
                      const trialExp = biz?.trial_expires_at ?? null;
                      const planExp = biz?.plan_expires_at ?? null;
                      const isTrial = trialExp && new Date(trialExp) > new Date() && !planExp;
                      const planLabel = isTrial ? `Trial hasta ${formatDate(trialExp)}` : getPlanLabel(planSlug);
                      return (
                        <tr key={u.id} className="border-b last:border-b-0 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-3 py-3">
                            <p className="font-medium">{u.email || '—'}</p>
                            <p className="text-xs opacity-50 truncate max-w-[180px]" title={u.id}>{u.id}</p>
                          </td>
                          <td className="px-3 py-3">
                            {banned ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#dc2626' }}>Suspendido</span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#059669' }}>Activo</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {u.role === 'admin' ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(124,58,237,0.15)', color: '#7C3AED' }}>Admin</span>
                            ) : (
                              <span className="text-xs opacity-60">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <PlanBadge slug={planSlug} />
                              {isTrial && <span className="text-xs opacity-70">Trial {formatDate(trialExp)}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 hidden md:table-cell text-xs opacity-60">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/users/${u.id}`)}
                              className="inline-flex items-center gap-1 text-xs font-medium"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              Ver
                              <Icon name="ChevronRight" size={12} color="var(--color-primary)" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="ArrowLeft" size={14} color="#fff" />
              Volver al panel admin
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/users/new')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="UserPlus" size={14} />
              Crear usuario
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
