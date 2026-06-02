import React from 'react';
import { Link } from 'react-router-dom';
import Icon from 'components/AppIcon';

export default function CrmBreadcrumb({ section }) {
  return (
    <div className="flex items-center gap-1" style={{ marginBottom: 1 }}>
      <Link
        to="/crm"
        className="text-[11px] font-medium hover:underline transition-colors"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        CRM
      </Link>
      <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
      <span
        className="text-[11px] font-medium"
        style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        {section}
      </span>
    </div>
  );
}
