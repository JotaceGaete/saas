import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";

export default function MetricCard({ title, value, subtitle, iconName, trend, trendValue, loading }) {
  if (loading) return <SkeletonCard />;

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-default"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-medium leading-tight"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          {title}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
        >
          <Icon name={iconName} size={17} color="var(--color-primary)" />
        </div>
      </div>

      <div>
        <p
          className="text-3xl font-extrabold leading-none"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}
        >
          {value}
        </p>
        {subtitle && (
          <p
            className="text-xs mt-1.5"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {trend && (
        <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: trend === 'up' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: trend === 'up' ? '#059669' : '#DC2626',
              fontFamily: 'var(--font-caption)',
            }}
          >
            <Icon
              name={trend === 'up' ? 'TrendingUp' : 'TrendingDown'}
              size={11}
              color={trend === 'up' ? '#059669' : '#DC2626'}
            />
            {trendValue}
          </div>
        </div>
      )}
    </div>
  );
}