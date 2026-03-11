import React from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-lg shadow-md text-xs" style={{ backgroundColor: 'var(--color-foreground)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
      <p className="font-semibold">{label}</p>
      <p>{payload?.[0]?.value} pedido{payload?.[0]?.value !== 1 ? 's' : ''}</p>
    </div>
  );
};

export default function OrdersByDayCard({ data, loading }) {
  if (loading) return <SkeletonCard />;

  const chartData = (data || [])?.map(d => ({
    label: DAY_LABELS?.[new Date(d.date + 'T12:00:00')?.getDay()],
    count: d?.count,
  }));

  const total = chartData?.reduce((s, d) => s + d?.count, 0);
  const maxVal = Math.max(...chartData?.map(d => d?.count), 1);

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pedidos por día</p>
          <p className="text-3xl font-extrabold leading-none mt-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}>{total}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Últimos 7 días</p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
          <Icon name="BarChart2" size={17} color="var(--color-primary)" />
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-3" style={{ height: 72 }}>
          <Icon name="BarChart2" size={22} color="var(--color-muted-foreground)" />
          <p className="text-xs text-center" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin pedidos en los últimos 7 días</p>
        </div>
      ) : (
        <div style={{ height: 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={14} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData?.map((entry, i) => (
                  <Cell key={i} fill={entry?.count === maxVal && maxVal > 0 ? 'var(--color-primary)' : 'rgba(124,58,237,0.25)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
