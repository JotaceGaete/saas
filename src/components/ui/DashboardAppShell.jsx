import React, { useState } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';

export default function DashboardAppShell({ children, backgroundColor = 'var(--color-background)' }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200 max-lg:bg-gradient-to-b max-lg:from-[#F8FAFC] max-lg:to-[#EFF1F5]"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {children}
      </main>
    </div>
  );
}

