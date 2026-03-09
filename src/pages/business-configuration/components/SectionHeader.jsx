import React from 'react';
import Icon from 'components/AppIcon';

export default function SectionHeader({ icon, title, description, collapsible, collapsed, onToggle }) {
  return (
    <div
      className={`flex items-center justify-between mb-4 md:mb-6 ${collapsible ? 'cursor-pointer select-none' : ''}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(196,112,74,0.12)' }}
        >
          <Icon name={icon} size={18} color="var(--color-primary)" />
        </div>
        <div>
          <h2 className="text-base md:text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            {title}
          </h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-caption)' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {collapsible && (
        <Icon name={collapsed ? 'ChevronDown' : 'ChevronUp'} size={18} color="var(--color-muted-foreground)" />
      )}
    </div>
  );
}