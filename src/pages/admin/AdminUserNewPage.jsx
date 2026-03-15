import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { createAdminUser } from 'services/adminUsersService';

export default function AdminUserNewPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('El email es obligatorio.');
      return;
    }
    setLoading(true);
    const { data, error: err } = await createAdminUser({
      email: trimmedEmail,
      password: password.trim() || undefined,
      user_metadata: name.trim() ? { name: name.trim(), full_name: name.trim() } : {},
    });
    setLoading(false);
    if (err) setError(err.message);
    else {
      setSuccess(true);
      setEmail('');
      setPassword('');
      setName('');
      setTimeout(() => navigate('/admin/users'), 2000);
    }
  };

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}>
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Crear usuario</h1>
          <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={13} />
            Listado
          </button>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '480px' }}>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: '#059669', backgroundColor: 'rgba(16,185,129,0.08)', color: '#059669' }}>
              <Icon name="CheckCircle" size={16} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>Usuario creado. Redirigiendo al listado...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', outline: 'none' }}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Contraseña (opcional)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dejar vacío para invitación por email"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Nombre (opcional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del usuario"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', outline: 'none' }}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
                {loading ? 'Creando...' : 'Crear usuario'}
              </button>
              <button type="button" onClick={() => navigate('/admin/users')} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
                Cancelar
              </button>
            </div>
          </form>

          <button type="button" onClick={() => navigate('/admin/users')} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={14} />
            Volver a usuarios
          </button>
        </div>
      </main>
    </div>
  );
}
