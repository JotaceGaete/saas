import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { useNavigationGuard } from 'contexts/NavigationGuardContext';

/**
 * FAB for primary action (e.g. Add product). Visible only on mobile.
 * Fixed bottom-right with safe-area; brand color, shadow, hover animation.
 */
export default function FloatingActionButton({
  onClick,
  to = '/product-editor',
  label = 'Agregar producto',
  icon = 'Plus',
}) {
  const navigate = useNavigate();
  const { attemptLeave } = useNavigationGuard();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      attemptLeave(() => navigate(to));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="lg:hidden fixed z-[99] w-14 h-14 rounded-full flex items-center justify-center text-white transition-transform duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary touch-manipulation"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        right: 'calc(16px + env(safe-area-inset-right, 0px))',
        backgroundColor: 'var(--color-primary, #7C3AED)',
        boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
        fontFamily: 'var(--font-caption)',
      }}
      aria-label={label}
    >
      <Icon name={icon} size={24} color="#FFFFFF" strokeWidth={2.5} />
    </button>
  );
}
