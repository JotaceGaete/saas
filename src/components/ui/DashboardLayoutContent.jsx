import React from 'react';

function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default function DashboardLayoutContent({ children, className = '', innerClassName = '' }) {
  return (
    <div
      className={joinClasses(
        'w-full min-w-0 max-w-full px-4 py-5 pb-24 sm:px-5 md:px-6 md:py-8 lg:px-8 lg:pb-8',
        className,
      )}
    >
      <div className={joinClasses('w-full max-w-full min-w-0 flex flex-col gap-5 overflow-x-clip md:gap-6 lg:max-w-7xl', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

