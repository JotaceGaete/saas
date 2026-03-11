import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";

const VARIANTS = {
  default: {
    iconBg: 'rgba(124,58,237,0.08)',
    iconColor: 'var(--color-primary)',
    trendUpBg: 'rgba(16,185,129,0.1)',
    trendUpColor: '#059669',
    trendDownBg: 'rgba(239,68,68,0.1)',
    trendDownColor: '#DC2626',
  },
  warning: {
    iconBg: 'rgba(245,158,11,0.1)',
    iconColor: '#D97706',
    trendUpBg: 'rgba(245,158,11,0.12)',
    trendUpColor: '#D97706',
    trendDownBg: 'rgba(239,68,68,0.1)',
    trendDownColor: '#DC2626',
  },
  danger: {
    iconBg: 'rgba(239,68,68,0.1)',
    iconColor: '#DC2626',
    trendUpBg: 'rgba(239,68,68,0.1)',
    trendUpColor: '#DC2626',
    trendDownBg: 'rgba(239,68,68,0.1)',
    trendDownColor: '#DC2626',
  },
  success: {
    iconBg: 'rgba(16,185,129,0.1)',
    iconColor: '#059669',
    trendUpBg: 'rgba(16,185,129,0.1)',
    trendUpColor: '#059669',
    trendDownBg: 'rgba(239,68,68,0.1)',
    trendDownColor: '#DC2626',
  },
};

export default function MetricCard({ title, value, subtitle, iconName, trend, trendValue, loading, onClick, variant = 'default', badge }) {
  if (loading) return <SkeletonCard />;

  const v = VARIANTS[variant] ?? VARIANTS.default;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={[
        "rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md w-full text-left",
        onClick ? "cursor-pointer active:scale-[0.98]" : "cursor-default",
        variant === 'warning' ? "border-amber-200" : "",
      ].join(' ')}
      style={{
        backgroundColor: variant === 'warning' ? 'rgba(255,251,235,1)' : '#FFFFFF',
        borderColor: variant === 'warning' ? 'rgba(245,158,11,0.3)' : 'var(--color-border)',
        boxShadow: variant === 'warning' ? '0 1px 3px rgba(245,158,11,0.15)' : 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p
            className="text-sm font-medium leading-tight truncate"
            style={{ color: variant === 'warning' ? '#92400E' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            {title}
          </p>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#DC2626', fontFamily: 'var(--font-caption)' }}>
              {badge}
            </span>
          )}
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: v.iconBg }}
        >
          <Icon name={iconName} size={17} color={v.iconColor} />
        </div>
      </div>

      <div>
        <p
          className="text-3xl font-extrabold leading-none"
          style={{ fontFamily: 'var(--font-heading)', color: variant === 'warning' ? '#92400E' : 'var(--color-foreground)', letterSpacing: '-0.03em' }}
        >
          {value}
        </p>
        {subtitle && (
          <p
            className="text-xs mt-1.5"
            style={{ color: variant === 'warning' ? '#B45309' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {(trend || onClick) && (
        <div className="flex items-center justify-between gap-1.5 pt-1 border-t" style={{ borderColor: variant === 'warning' ? 'rgba(245,158,11,0.2)' : 'var(--color-border)' }}>
          {trend && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: trend === 'up' ? v.trendUpBg : v.trendDownBg,
                color: trend === 'up' ? v.trendUpColor : v.trendDownColor,
                fontFamily: 'var(--font-caption)',
              }}
            >
              <Icon
                name={trend === 'up' ? 'TrendingUp' : 'TrendingDown'}
                size={11}
                color={trend === 'up' ? v.trendUpColor : v.trendDownColor}
              />
              {trendValue}
            </div>
          )}
          {onClick && (
            <span className="ml-auto text-xs font-semibold flex items-center gap-0.5" style={{ color: variant === 'warning' ? '#D97706' : 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
              Ver <Icon name="ChevronRight" size={12} color={variant === 'warning' ? '#D97706' : 'var(--color-primary)'} />
            </span>
          )}
        </div>
      )}
    </Tag>
  );
}
