import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getPlanLabel } from '../../constants/plans';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  {
    label: 'Productos',
    path: '/product-management',
    icon: 'Package',
    subItems: [
      { label: 'Catálogo', path: '/product-management' },
      { label: 'Nuevo Producto', path: '/product-editor' },
    ],
  },
  { label: 'Pedidos', path: '/orders', icon: 'ShoppingCart' },
  { label: 'Configuración', path: '/business-configuration', icon: 'Settings' },
];

const MOBILE_NAV = [
  { label: 'Inicio', path: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Productos', path: '/product-management', icon: 'Package' },
  { label: 'Pedidos', path: '/orders', icon: 'ShoppingCart' },
  { label: 'Config', path: '/business-configuration', icon: 'Settings' },
];

export default function BusinessSidebar({ isCollapsed = false, onCollapsedChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, business, signOut, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(isCollapsed);
  const [expandedItems, setExpandedItems] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  const userInitial = business?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';
  const userLabel = business?.name || user?.email || 'Mi Negocio';

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
    <div className="flex flex-col h-full bg-white">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Icon name="ShoppingBag" size={16} color="#FFFFFF" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <span className="block font-bold text-sm leading-tight truncate" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.015em' }}>
              CatálogoApp
            </span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Panel de Negocios
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2" aria-label="Navegación principal">
        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS?.map((item) => {
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
                    'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                    'min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-150',
                    active
                      ? 'text-primary font-semibold' :'text-muted-foreground hover:text-foreground hover:bg-muted',
                    active ? 'active' : '',
                    collapsed ? 'justify-center' : '',
                  ]?.join(' ')}
                  style={{
                    fontFamily: 'var(--font-caption)',
                    backgroundColor: active ? 'rgba(124, 58, 237, 0.07)' : undefined,
                  }}
                >
                  <Icon
                    name={item?.icon}
                    size={17}
                    color={active ? 'var(--color-primary)' : 'currentColor'}
                    className="flex-shrink-0"
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item?.label}</span>
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
                              subActive ? 'text-primary font-semibold bg-violet-50' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
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
            <li role="listitem" className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => navigate('/admin')}
                aria-current={isActive('/admin') ? 'page' : undefined}
                className={[
                  'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                  'min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-150',
                  isActive('/admin') ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  isActive('/admin') ? 'active' : '',
                  collapsed ? 'justify-center' : '',
                ]?.join(' ')}
                style={{
                  fontFamily: 'var(--font-caption)',
                  backgroundColor: isActive('/admin') ? 'rgba(239,68,68,0.07)' : undefined,
                }}
              >
                <Icon name="Shield" size={17} color={isActive('/admin') ? 'var(--color-error)' : 'currentColor'} className="flex-shrink-0" />
                {!collapsed && <span className="flex-1 text-left truncate">Panel admin</span>}
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Footer — menú de usuario */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--color-border)' }} ref={userMenuRef}>
        {!collapsed ? (
          <div className="relative">
            {userMenuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 py-1 rounded-lg border shadow-lg overflow-hidden"
                style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', zIndex: 9999 }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUserMenuOpen(false); navigate('/planes'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="CreditCard" size={14} color="var(--color-muted-foreground)" />
                  Ver planes
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: 'var(--color-muted)' }}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label="Menú de usuario"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
              >
                {userInitial}
              </div>
              <div className="flex-1 overflow-hidden text-left">
                <p className="text-xs font-semibold text-foreground truncate" style={{ fontFamily: 'var(--font-caption)' }}>{userLabel}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{getPlanLabel(business?.planSlug)}</p>
              </div>
              <Icon name={userMenuOpen ? 'ChevronUp' : 'ChevronDown'} size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
            </button>
          </div>
        ) : (
          <div className="relative flex justify-center py-1">
            {userMenuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 py-1 rounded-lg border shadow-lg"
                style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', minWidth: '160px', zIndex: 9999 }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUserMenuOpen(false); navigate('/planes'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
                >
                  <Icon name="CreditCard" size={14} color="var(--color-muted-foreground)" />
                  Ver planes
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
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
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
          className="hidden lg:flex w-full items-center justify-center mt-1.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
        >
          <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={15} color="currentColor" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3.5 left-4 z-navigation w-10 h-10 flex items-center justify-center rounded-xl bg-white border text-foreground hover:bg-muted transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <aside
          className="lg:hidden fixed top-0 left-0 h-full z-modal border-r"
          style={{ width: 'var(--sidebar-width)', backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xl)' }}
          aria-label="Menú de navegación"
        >
          <div className="absolute top-4 right-4">
            <button
              onClick={() => setMobileOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Cerrar menú"
            >
              <Icon name="X" size={16} color="var(--color-foreground)" />
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
          backgroundColor: '#FFFFFF',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-xs)',
          transition: 'width var(--transition-base)',
        }}
        aria-label="Navegación lateral"
      >
        <SidebarContent />
      </aside>

      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav lg:hidden" aria-label="Navegación inferior">
        <div className="flex items-center justify-around px-2">
          {MOBILE_NAV?.map((item) => {
            const active = location?.pathname === item?.path || location?.pathname?.startsWith(item?.path + '/');
            return (
              <button
                key={item?.path}
                onClick={() => navigate(item?.path)}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 min-w-[56px]"
                style={{ color: active ? 'var(--color-primary)' : 'var(--color-muted-foreground)' }}
                aria-label={item?.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item?.icon} size={20} color="currentColor" />
                <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-caption)', fontSize: '10px' }}>{item?.label}</span>
              </button>
            );
          })}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 min-w-[56px]"
              style={{ color: location?.pathname === '/admin' ? 'var(--color-error)' : 'var(--color-muted-foreground)' }}
              aria-label="Panel admin"
              aria-current={location?.pathname === '/admin' ? 'page' : undefined}
            >
              <Icon name="Shield" size={20} color="currentColor" />
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-caption)', fontSize: '10px' }}>Admin</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}