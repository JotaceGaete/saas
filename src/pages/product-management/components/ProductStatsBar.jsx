import React from "react";
import Icon from "components/AppIcon";

export default function ProductStatsBar({ stats }) {
  const items = [
    {
      label: "Total",
      value: stats?.total,
      icon: "Package",
      color: 'var(--color-foreground)',
      bg: 'rgba(15,23,42,0.06)',
      iconColor: 'var(--color-foreground)',
    },
    {
      label: "Activos",
      value: stats?.active,
      icon: "CheckCircle",
      color: '#059669',
      bg: 'rgba(16,185,129,0.1)',
      iconColor: '#059669',
    },
    {
      label: "Inactivos",
      value: stats?.inactive,
      icon: "XCircle",
      color: '#64748B',
      bg: 'rgba(100,116,139,0.1)',
      iconColor: '#64748B',
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items?.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border"
          style={{
            backgroundColor: item?.bg,
            borderColor: 'transparent',
          }}
        >
          <Icon name={item?.icon} size={14} color={item?.iconColor} />
          <span
            className="text-sm font-bold"
            style={{ color: item?.color, fontFamily: 'var(--font-heading)' }}
          >
            {item?.value}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: item?.color, fontFamily: 'var(--font-caption)', opacity: 0.8 }}
          >
            {item?.label}
          </span>
        </div>
      ))}
    </div>
  );
}