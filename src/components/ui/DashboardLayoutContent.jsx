import React from 'react';

function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default function DashboardLayoutContent({ children, className = '', innerClassName = '' }) {
  return (
    <div
      className={joinClasses(
        'w-full min-w-0 px-4 md:px-6 lg:px-8 py-6 md:py-8 pb-20 lg:pb-8',
        className,
      )}
    >
      <div className={joinClasses('w-full max-w-7xl min-w-0 space-y-6', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

