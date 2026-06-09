import React, { useState } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';

export default function DashboardAppShell({ children, backgroundColor = 'var(--color-background)' }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const mainWidth = isDesktop ? `calc(100% - ${sidebarWidth})` : '100%';

  return (
    <div className="panel-root min-h-screen w-full max-w-full min-w-0 overflow-x-clip" style={{ backgroundColor }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main flex min-h-screen min-w-0 justify-center overflow-x-clip overflow-y-visible transition-all duration-200"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div className="mx-auto w-full min-w-0 max-w-[480px] overflow-x-clip md:max-w-none lg:overflow-visible">
          {children}
        </div>
      </main>
    </div>
  );
}

