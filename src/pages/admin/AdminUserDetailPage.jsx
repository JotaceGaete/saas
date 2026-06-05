import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { useToast } from 'components/ui/Toast';
import {
  getAdminUser,
  banAdminUser,
  unbanAdminUser,
  deleteAdminUser,
  setAdminUserRole,
  impersonateUser,
} from 'services/adminUsersService';
import { adminChangePlan } from 'services/adminPaymentsService';
import { getPlanLabel, getPlanColors } from 'constants/plans';
import { APP_ORIGIN } from 'config/appUrl';
import { supabase } from 'lib/supabase';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

export default function AdminUserDetailPage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1400);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [user, setUser] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [changePlanBizId, setChangePlanBizId] = useState(null);
  const [newPlanSlug, setNewPlanSlug] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getAdminUser(userId);
    if (err) setError(err.message);
    else if (data) {
      setUser(data.user);
      setBusinesses(data.businesses ?? []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (key, fn) => {
    setActionLoading(key);
    setMessage(null);
    const { data, error: err } = await fn();
    setActionLoading(null);
    if (err) setMessage({ type: 'error', text: err.message });
    else {
      setMessage({ type: 'success', text: 'Listo.' });
      load();
    }
  };

  const handleBan = () => runAction('ban', () => banAdminUser(userId));
  const handleUnban = () => runAction('unban', () => unbanAdminUser(userId));
  const handleSetRole = (isAdmin) => runAction('role', () => setAdminUserRole(userId, isAdmin));

  const handleDelete = async () => {
    if (deleteTyped !== 'ELIMINAR') return;
    setActionLoading('delete');
    setMessage(null);
    const { error: err } = await deleteAdminUser(userId);
    setActionLoading(null);
    if (err) setMessage({ type: 'error', text: err.message });
    else {
      setMessage({ type: 'success', text: 'Usuario eliminado.' });
      setTimeout(() => navigate('/admin/users'), 1500);
    }
  };

  const handleChangePlan = async () => {
    if (!changePlanBizId || !newPlanSlug) return;
    setActionLoading('changePlan');
    setMessage(null);
    const { error: err } = await adminChangePlan(changePlanBizId, newPlanSlug, 'Cambio desde panel usuarios');
    setActionLoading(null);
    if (err) setMessage({ type: 'error', text: err.message });
    else {
      setMessage({ type: 'success', text: 'Plan actualizado.' });
      setChangePlanBizId(null);
      setNewPlanSlug('');
      load();
    }
  };

  const handleImpersonate = async () => {
    if (!user?.id) return;
    setActionLoading('impersonate');

    // Get admin's own email to embed in the redirectTo URL.
    // The impersonated tab reads it from ?ae= to display in the support banner.
    let adminEmail = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      adminEmail = session?.user?.email ?? '';
    } catch { /* non-fatal */ }

    // Always use the canonical app origin — never window.location.origin,
    // which would break if the admin panel is accessed from a non-canonical host.
    const adminHandle = adminEmail ? adminEmail.split('@')[0] : '';
    const redirectTo = `${APP_ORIGIN}/dashboard?impersonated=1${adminHandle ? `&ae=${encodeURIComponent(adminHandle)}` : ''}`;

    const { data, error: err } = await impersonateUser(user.id, redirectTo);
    setActionLoading(null);

    if (err) {
      toast.error(err.message || 'No se pudo generar el acceso de soporte');
      return;
    }

    toast.success(`Abriendo sesión como ${data.targetEmail}`);
    window.open(data.loginUrl, '_blank', 'noopener,noreferrer');
  };

  const banned = user?.banned_until && new Date(user.banned_until) > new Date();
  const isAdmin = user?.role === 'admin';

  if (loading && !user) {
    return (
      <div className="panel-root min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="animate-pulse text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Cargando...</div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="panel-root min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>Usuario no encontrado</p>
          <button type="button" onClick={() => navigate('/admin/users')} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            Volver a usuarios
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Detalle de usuario</h1>
            <p className="text-xs hidden sm:block truncate max-w-[280px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{user?.email}</p>
          </div>
          <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={13} />
            Listado
          </button>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '800px' }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}
          {message && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: message.type === 'error' ? 'var(--color-error)' : '#059669', backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', color: message.type === 'error' ? 'var(--color-error)' : '#059669' }}>
              <Icon name={message.type === 'error' ? 'AlertCircle' : 'CheckCircle'} size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{message.text}</span>
            </div>
          )}

          <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Cuenta</h2>
            <dl className="grid gap-2 text-sm">
              <div><dt className="opacity-70">Email</dt><dd className="font-medium">{user?.email ?? '—'}</dd></div>
              <div><dt className="opacity-70">ID</dt><dd className="font-mono text-xs break-all">{user?.id}</dd></div>
              <div><dt className="opacity-70">Creado</dt><dd>{formatDate(user?.created_at)}</dd></div>
              <div><dt className="opacity-70">Último acceso</dt><dd>{formatDate(user?.last_sign_in_at)}</dd></div>
              <div><dt className="opacity-70">Estado</dt><dd>{banned ? <span style={{ color: '#dc2626' }}>Suspendido</span> : <span style={{ color: '#059669' }}>Activo</span>}</dd></div>
              <div><dt className="opacity-70">Rol</dt><dd>{isAdmin ? <span style={{ color: '#7C3AED' }}>Admin</span> : 'Usuario'}</dd></div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {banned ? (
                <button type="button" onClick={handleUnban} disabled={!!actionLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#059669' }}>
                  {actionLoading === 'unban' ? '...' : 'Habilitar usuario'}
                </button>
              ) : (
                <button type="button" onClick={handleBan} disabled={!!actionLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#dc2626' }}>
                  {actionLoading === 'ban' ? '...' : 'Suspender usuario'}
                </button>
              )}
              <button type="button" onClick={() => handleSetRole(!isAdmin)} disabled={!!actionLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--color-border)' }}>
                {actionLoading === 'role' ? '...' : isAdmin ? 'Quitar rol admin' : 'Asignar rol admin'}
              </button>
              <button
                type="button"
                onClick={handleImpersonate}
                disabled={!!actionLoading || isAdmin}
                title={isAdmin ? 'No se puede impersonar a otros admins' : 'Abrir sesión como este usuario en nueva pestaña'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#7C3AED', opacity: isAdmin ? 0.4 : 1 }}
              >
                <Icon name="LogIn" size={13} color="#7C3AED" />
                {actionLoading === 'impersonate' ? 'Generando...' : 'Entrar como usuario'}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(true)} disabled={!!actionLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                Eliminar usuario
              </button>
            </div>
          </section>

          <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Negocios</h2>
            {businesses.length === 0 ? (
              <p className="text-sm opacity-70" style={{ fontFamily: 'var(--font-caption)' }}>Sin negocios</p>
            ) : (
              <ul className="space-y-3">
                {businesses.map((b) => {
                  const trialExp = b.trial_expires_at ?? null;
                  const planExp = b.plan_expires_at ?? null;
                  const isTrial = trialExp && new Date(trialExp) > new Date() && !planExp;
                  const isEditing = changePlanBizId === b.id;
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{b.name}</p>
                        <p className="text-xs opacity-60">{b.slug} · <PlanBadge slug={b.plan_slug} /> {isTrial && `Trial hasta ${formatDate(trialExp)}`}</p>
                        {planExp && !isTrial && <p className="text-xs opacity-60">Plan vence: {formatDate(planExp)}</p>}
                      </div>
                      {!isEditing ? (
                        <button type="button" onClick={() => { setChangePlanBizId(b.id); setNewPlanSlug(b.plan_slug === 'control' ? 'starter' : (b.plan_slug || 'starter')); }} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                          Cambiar plan
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select value={newPlanSlug} onChange={(e) => setNewPlanSlug(e.target.value)} className="text-xs rounded border px-2 py-1" style={{ borderColor: 'var(--color-border)' }}>
                            <option value="starter">Starter</option>
                            <option value="pro">Pro</option>
                            <option value="business">Full</option>
                          </select>
                          <button type="button" onClick={handleChangePlan} disabled={!!actionLoading} className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>Aplicar</button>
                          <button type="button" onClick={() => { setChangePlanBizId(null); setNewPlanSlug(''); }} className="text-xs opacity-70">Cancelar</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {deleteConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="rounded-xl border p-6 max-w-md w-full" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                <h3 className="text-sm font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Eliminar usuario</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Esta acción no se puede deshacer. Los datos del usuario y sus negocios pueden verse afectados. Escribe <strong>ELIMINAR</strong> para confirmar.
                </p>
                <input
                  type="text"
                  value={deleteTyped}
                  onChange={(e) => setDeleteTyped(e.target.value)}
                  placeholder="ELIMINAR"
                  className="w-full px-3 py-2 rounded-lg border mb-4 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setDeleteConfirm(false); setDeleteTyped(''); }} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--color-border)' }}>
                    Cancelar
                  </button>
                  <button type="button" onClick={handleDelete} disabled={deleteTyped !== 'ELIMINAR' || !!actionLoading} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#dc2626', color: '#fff' }}>
                    {actionLoading === 'delete' ? '...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <button type="button" onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={14} color="#fff" />
            Volver a usuarios
          </button>
        </div>
      </main>
    </div>
  );
}
