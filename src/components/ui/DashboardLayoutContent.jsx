import React from 'react';

function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}

export default function DashboardLayoutContent({ children, className = '', innerClassName = '' }) {
  return (
    <div
      className={joinClasses(
        'w-full min-w-0 px-4 sm:px-5 md:px-6 lg:px-8 py-5 md:py-8 pb-24 lg:pb-8',
        className,
      )}
    >
      <div className={joinClasses('w-full max-w-7xl min-w-0 flex flex-col gap-5 md:gap-6', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

