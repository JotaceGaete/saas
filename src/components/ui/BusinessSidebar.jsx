import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import VCheckIsotype from 'components/branding/VCheckIsotype';
import VentalinkLogo from 'components/branding/VentalinkLogo';
import MobileBottomNav from 'components/MobileBottomNav';
import FloatingActionButton from 'components/FloatingActionButton';
import { useAuth } from '../../contexts/AuthContext';
import { getPlanLabel } from '../../constants/plans';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import { SUPPORT_WHATSAPP_NUMBER } from '../../config/support';

const NAV_ITEMS = [
  { label: 'Mi tienda', path: '/dashboard', icon: 'Store' },
  { label: 'Productos', path: '/product-management', icon: 'Package' },
  { label: 'Pedidos', path: '/orders', icon: 'ShoppingCart' },
  { label: 'Historial pedidos', path: '/orders/historial', icon: 'History' },
  { label: 'CRM', path: '/crm', icon: 'LayoutDashboard' },
  { label: 'Proveedores', path: '/proveedores', icon: 'Truck' },
  { label: 'Configuración', path: '/business-configuration', icon: 'Settings' },
  { label: 'Diseño', path: '/design', icon: 'Palette' },
  { label: 'Plan y facturación', path: '/planes', icon: 'CreditCard' },
  { label: 'Ayuda', path: '/ayuda', icon: 'HelpCircle' },
];

export default function BusinessSidebar({ isCollapsed = false, onCollapsedChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, business, signOut, isAdmin, isImpersonating, stopImpersonation } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(isCollapsed);
  const [expandedItems, setExpandedItems] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => { setCollapsed(isCollapsed); }, [isCollapsed]);
  useEffect(() => { setMobileOpen(false); }, [location?.pathname]);
  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e) => {
      if (userMenuRef?.current && !userMenuRef?.current?.contains(e?.target)) setUserMenuOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    await signOut?.();
    navigate('/login');
  };

  const handleOpenProfile = () => {
    setUserMenuOpen(false);
    setProfileOpen(true);
  };

  const handleGoTo = (path) => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    navigate(path);
  };

  const handleCancelRequest = () => {
    const businessNameForMessage = business?.name != null ? String(business.name) : '';
    const userEmailForMessage = user?.email != null ? String(user.email) : '';
    const planForMessage = planLabel != null ? String(planLabel) : '';
    const countryForMessage = business?.country != null ? String(business.country) : '';
    const message = `Hola, quiero solicitar la cancelación de mi suscripción en Walinka.

Negocio: ${businessNameForMessage}
Email: ${userEmailForMessage}
Plan: ${planForMessage}
País: ${countryForMessage}

Motivo (opcional):`;
    const url = buildWhatsAppUrl(message, SUPPORT_WHATSAPP_NUMBER);
    openWhatsAppUrl(url);
    setUserMenuOpen(false);
  };

  const userInitial = business?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';
  const userLabel = business?.name || user?.email || 'Mi Negocio';
  const userEmail = user?.email || 'Sin email';
  const planLabel = getPlanLabel(business?.planSlug);
  const businessWhatsApp = business?.whatsapp || '';
  const businessCountry = business?.country || business?.countryCodeDb || '';

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  };

  const handleNavClick = (item) => {
    if (item?.subItems) {
      setExpandedItems(prev => ({ ...prev, [item?.path]: !prev?.[item?.path] }));
      if (collapsed) { setCollapsed(false); onCollapsedChange?.(false); }
    } else {
      navigate(item?.path);
    }
  };

  const isActive = (path) => location?.pathname === path || location?.pathname?.startsWith(path + '/');
  const isParentActive = (item) => {
    if (isActive(item?.path)) return true;
    if (item?.subItems) return item?.subItems?.some(sub => isActive(sub?.path));
    return false;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#0F1720', color: '#D1D5DB' }}>
      {/* Logo */}
      <div className={`sidebar-header ${collapsed ? 'justify-center' : ''}`}>
        {collapsed ? (
          <div className="sidebar-logo">
            <VCheckIsotype variant="embedded" size={20} title="Walinka" />
          </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden">
            <VentalinkLogo variant="light" height={26} className="max-w-full [&_svg]:max-w-full" />
            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
              Operating panel
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5" aria-label="Navegación principal">
        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS?.filter(item => !item?.adminOnly || isAdmin)?.map((item, idx) => {
            if (item?.section) {
              if (collapsed) return null;
              return (
                <li key={`section-${idx}`} role="separator" className="px-3 pt-3 pb-1">
                  {item.label !== '—' && <span className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold select-none">{item.label.replace(/—/g, '').trim()}</span>}
                  {item.label === '—' && <div className="h-px bg-white/5" />}
                </li>
              );
            }
            const active = isParentActive(item);
            const expanded = expandedItems?.[item?.path];
            return (
              <li key={item?.path} role="listitem">
                <button
                  onClick={() => handleNavClick(item)}
                  aria-current={active && !item?.subItems ? 'page' : undefined}
                  aria-expanded={item?.subItems ? expanded : undefined}
                  title={collapsed ? item?.label : undefined}
                  className={[
                    'nav-item w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium',
                    'min-h-[34px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-all duration-150',
                    active
                      ? 'font-semibold text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]',
                    active ? 'active' : '',
                    collapsed ? 'justify-center' : '',
                  ]?.join(' ')}
                  style={{
                    fontFamily: 'var(--font-caption)',
                    backgroundColor: active ? 'rgba(255, 255, 255, 0.075)' : undefined,
                  }}
                >
                  <Icon
                    name={item?.icon}
                    size={16}
                    color="currentColor"
                    className="flex-shrink-0"
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item?.label}</span>
                      {item?.badge && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {item.badge}
                        </span>
                      )}
                      {item?.subItems && (
                        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={13} color="currentColor" className="flex-shrink-0 opacity-50" />
                      )}
                    </>
                  )}
                </button>
                {item?.subItems && !collapsed && expanded && (
                  <ul className="mt-0.5 ml-8 space-y-0.5" role="list">
                    {item?.subItems?.map((sub) => {
                      const subActive = isActive(sub?.path);
                      return (
                        <li key={sub?.path} role="listitem">
                          <button
                            onClick={() => navigate(sub?.path)}
                            aria-current={subActive ? 'page' : undefined}
                            className={[
                              'w-full text-left px-3 py-2 rounded-md text-xs transition-all duration-150',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              subActive ? 'text-white font-semibold bg-white/[0.09]' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]',
                            ]?.join(' ')}
                            style={{ fontFamily: 'var(--font-caption)' }}
                          >
                            {sub?.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {isAdmin && (
            <>
              {/* ── OPERACIÓN ── */}
              <li role="listitem" className="pt-3 mt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                {!collapsed && (
                  <span className="block px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#64748B', fontFamily: 'var(--font-caption)', opacity: 0.82 }}>
                    Operación
                  </span>
                )}
              </li>
              {[
                { label: 'Negocios',           path: '/admin/businesses', icon: 'Store',      match: (p) => p.startsWith('/admin/businesses') },
                { label: 'Pagos y suscripciones', path: '/admin/payments', icon: 'CreditCard', match: (p) => p === '/admin/payments' },
                { label: 'Usuarios',           path: '/admin/users',     icon: 'Users',      match: (p) => p.startsWith('/admin/users') },
              ].map(item => {
                const active = item.match(location?.pathname || '');
                return (
                  <li key={item.path} role="listitem">
                    <button
                      onClick={() => navigate(item.path)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'nav-item w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium',
                        'min-h-[34px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-all duration-150',
                        active ? 'text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]',
                        collapsed ? 'justify-center' : '',
                      ].join(' ')}
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: active ? 'rgba(255,255,255,0.075)' : undefined }}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon name={item.icon} size={16} color="currentColor" className="flex-shrink-0" />
                      {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}

              {/* ── CONFIGURACIÓN ── */}
              <li role="listitem" className="pt-2 mt-1">
                {!collapsed && (
                  <span className="block px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#64748B', fontFamily: 'var(--font-caption)', opacity: 0.82 }}>
                    Configuración
                  </span>
                )}
              </li>
              {[
                { label: 'Rubros y categorías', path: '/admin/config/rubros',      icon: 'Tag',         match: (p) => p.startsWith('/admin/config') },
                { label: 'Funciones por plan',  path: '/admin/plan-features',      icon: 'LayoutGrid',  match: (p) => p === '/admin/plan-features' },
              ].map(item => {
                const active = item.match(location?.pathname || '');
                return (
                  <li key={item.path} role="listitem">
                    <button
                      onClick={() => navigate(item.path)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'nav-item w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium',
                        'min-h-[34px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-all duration-150',
                        active ? 'text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]',
                        collapsed ? 'justify-center' : '',
                      ].join(' ')}
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: active ? 'rgba(255,255,255,0.075)' : undefined }}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon name={item.icon} size={16} color="currentColor" className="flex-shrink-0" />
                      {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}

              {/* ── ANALYTICS ── */}
              <li role="listitem" className="pt-2 mt-1">
                {!collapsed && (
                  <span className="block px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#64748B', fontFamily: 'var(--font-caption)', opacity: 0.82 }}>
                    Analytics
                  </span>
                )}
              </li>
              {[
                { label: 'Auditoría', path: '/admin/audit-log', icon: 'ClipboardList', match: (p) => p === '/admin/audit-log' },
                { label: 'Emails',    path: '/admin/emails',    icon: 'Mail',          match: (p) => p === '/admin/emails' },
              ].map(item => {
                const active = item.match(location?.pathname || '');
                return (
                  <li key={item.path} role="listitem">
                    <button
                      onClick={() => navigate(item.path)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'nav-item w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium',
                        'min-h-[34px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-all duration-150',
                        active ? 'text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]',
                        collapsed ? 'justify-center' : '',
                      ].join(' ')}
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: active ? 'rgba(255,255,255,0.075)' : undefined }}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon name={item.icon} size={16} color="currentColor" className="flex-shrink-0" />
                      {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      </nav>

      {/* Footer — menú de usuario */}
      <div className="p-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }} ref={userMenuRef}>
        {!collapsed ? (
          <div className="relative">
            {userMenuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 py-1 rounded-lg border shadow-lg overflow-hidden"
                style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', zIndex: 9999 }}
              >
                <div
                  className="px-3 py-2.5 border-b"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-foreground)' }}>{userLabel}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>{userEmail}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Plan: {planLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleOpenProfile(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="User" size={14} color="var(--color-muted-foreground)" />
                  Ver perfil
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGoTo('/planes'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="CreditCard" size={14} color="var(--color-muted-foreground)" />
                  Plan y facturación
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCancelRequest(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="MessageCircle" size={14} color="var(--color-muted-foreground)" />
                  Solicitar cancelación
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGoTo('/ayuda'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="HelpCircle" size={14} color="var(--color-muted-foreground)" />
                  Soporte
                </button>
                {isAdmin && isImpersonating && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stopImpersonation(); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                  >
                    <Icon name="UserX" size={14} color="var(--color-muted-foreground)" />
                    Salir de modo admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="LogOut" size={14} color="var(--color-muted-foreground)" />
                  Cerrar sesión
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUserMenuOpen((prev) => !prev); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              style={{ backgroundColor: 'rgba(255,255,255,0.045)' }}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label="Menú de usuario"
            >
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: '#F9FAFB', color: '#111827' }}
              >
                {userInitial}
              </div>
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)', color: '#F9FAFB' }}>{userLabel}</p>
                <p className="truncate text-[11px]" style={{ color: '#8B95A1', fontFamily: 'var(--font-caption)' }}>{getPlanLabel(business?.planSlug)}</p>
              </div>
              <Icon name={userMenuOpen ? 'ChevronUp' : 'ChevronDown'} size={13} color="#9CA3AF" className="flex-shrink-0" />
            </button>
          </div>
        ) : (
          <div className="relative flex justify-center py-1">
            {userMenuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 py-1 rounded-lg border shadow-lg"
                style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', minWidth: '160px', zIndex: 9999 }}
              >
                <div
                  className="px-3 py-2.5 border-b"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-foreground)' }}>{userLabel}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>{userEmail}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Plan: {planLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleOpenProfile(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="User" size={14} color="var(--color-muted-foreground)" />
                  Ver perfil
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGoTo('/planes'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="CreditCard" size={14} color="var(--color-muted-foreground)" />
                  Plan y facturación
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCancelRequest(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="MessageCircle" size={14} color="var(--color-muted-foreground)" />
                  Solicitar cancelación
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGoTo('/ayuda'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="HelpCircle" size={14} color="var(--color-muted-foreground)" />
                  Soporte
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="LogOut" size={14} color="var(--color-muted-foreground)" />
                  Cerrar sesión
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUserMenuOpen((prev) => !prev); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: '#F9FAFB', color: '#111827' }}
              title={userLabel}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label="Menú de usuario"
            >
              {userInitial}
            </button>
          </div>
        )}
        <button
          onClick={handleCollapse}
          className="hidden lg:flex w-full items-center justify-center mt-1.5 p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
        >
          <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={15} color="currentColor" />
        </button>
      </div>
      {profileOpen && (
        <div
          className="fixed inset-0 z-modal"
          style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
          onClick={() => setProfileOpen(false)}
        >
          <div className="w-full h-full flex items-center justify-center p-4">
            <div
              className="w-full max-w-md rounded-2xl border shadow-xl p-5"
              style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>Perfil</h3>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                  aria-label="Cerrar perfil"
                >
                  <Icon name="X" size={15} color="var(--color-muted-foreground)" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <p style={{ color: 'var(--color-foreground)' }}><span className="font-semibold">Negocio:</span> {userLabel}</p>
                <p style={{ color: 'var(--color-foreground)' }}><span className="font-semibold">Email:</span> {userEmail}</p>
                {businessWhatsApp ? (
                  <p style={{ color: 'var(--color-foreground)' }}><span className="font-semibold">WhatsApp:</span> {businessWhatsApp}</p>
                ) : null}
                {businessCountry ? (
                  <p style={{ color: 'var(--color-foreground)' }}><span className="font-semibold">País:</span> {businessCountry}</p>
                ) : null}
                <p style={{ color: 'var(--color-foreground)' }}><span className="font-semibold">Plan:</span> {planLabel}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile hamburger — centrado verticalmente en el header (60px), respeta safe area */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed z-navigation w-11 h-11 flex items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md border-0 text-foreground hover:bg-muted transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-slate-200/70"
        style={{
          top: 'calc(var(--safe-area-top) + 10px)',
          left: 'max(calc((100vw - min(100vw, 480px)) / 2 + 16px), calc(var(--safe-area-left) + 16px))',
        }}
        aria-label="Abrir menú de navegación"
        aria-expanded={mobileOpen}
      >
        <Icon name="Menu" size={18} color="currentColor" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-modal overlay-enter"
          style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer — respeta safe area superior */}
      {mobileOpen && (
        <aside
          className="lg:hidden fixed top-0 left-0 h-full z-modal border-r"
          style={{
            width: 'var(--sidebar-width)',
            left: 'max(calc((100vw - min(100vw, 480px)) / 2), var(--safe-area-left))',
            backgroundColor: '#111827',
            borderColor: 'rgba(255,255,255,0.08)',
            boxShadow: 'var(--shadow-xl)',
            paddingTop: 'var(--safe-area-top)',
          }}
          aria-label="Menú de navegación"
        >
          <div
            className="absolute right-4"
            style={{ top: 'calc(var(--safe-area-top) + 16px)' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Cerrar menú"
            >
              <Icon name="X" size={16} color="#F9FAFB" />
            </button>
          </div>
          <SidebarContent />
        </aside>
      )}

      {/* Desktop sidebar: no ocupar espacio en móvil; solo visible desde lg */}
      <aside
        className="sidebar-desktop hidden lg:flex flex-col fixed top-0 left-0 h-full z-navigation border-r"
        style={{
          width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          backgroundColor: '#111827',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '8px 0 30px rgba(17,24,39,0.18)',
          transition: 'width var(--transition-base)',
        }}
        aria-label="Navegación lateral"
      >
        <SidebarContent />
      </aside>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />
      {/* FAB: Add product — visible on mobile on main app pages */}
      <FloatingActionButton to="/product-editor" label="Agregar producto" icon="Plus" />
    </>
  );
}
