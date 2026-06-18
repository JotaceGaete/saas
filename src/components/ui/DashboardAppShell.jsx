import React, { useState } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';

function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default function DashboardAppShell({
  children,
  backgroundColor = 'var(--color-background)',
  allowDesktopOverflow = false,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div
      className={joinClasses(
        'panel-root min-h-screen w-full max-w-full min-w-0 overflow-x-clip',
        allowDesktopOverflow && 'xl:overflow-x-visible',
      )}
      style={{ backgroundColor }}
    >
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className={joinClasses(
          'panel-main flex min-h-screen min-w-0 justify-center overflow-x-clip overflow-y-visible transition-all duration-200',
          allowDesktopOverflow && 'xl:overflow-x-visible',
        )}
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div
          className={joinClasses(
            'mx-auto w-full min-w-0 max-w-[480px] overflow-x-clip md:max-w-none lg:overflow-visible',
            allowDesktopOverflow && 'xl:overflow-visible',
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

