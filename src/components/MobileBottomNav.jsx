import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { useAuth } from 'contexts/AuthContext';

const ITEMS = [
  { label: 'Inicio', path: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Productos', path: '/product-management', icon: 'Package' },
  { label: 'Pedidos', path: '/orders', icon: 'ShoppingCart' },
    { label: 'Config', path: '/design', icon: 'Settings' },
];

const ADMIN_ITEM = { label: 'Admin', path: '/admin', icon: 'Shield' };

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS;

  const isActive = (path) =>
    location?.pathname === path || location?.pathname?.startsWith(path + '/');

  return (
    <nav
      className="mobile-bottom-nav lg:hidden"
      aria-label="Navegación inferior"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      <div className="flex items-center justify-around px-2">
        {items.map((item) => {
          const active = isActive(item.path);
          const isAdminTab = item.path === '/admin';
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl transition-colors duration-200 min-w-[64px] min-h-[56px] touch-manipulation active:scale-[0.98]"
              style={{
                color: active ? (isAdminTab ? 'var(--color-error)' : 'var(--color-primary)') : 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-caption)',
              }}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={22} color="currentColor" strokeWidth={active ? 2.5 : 2} />
              <span className="text-xs font-medium" style={{ fontSize: '11px' }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
