import React from "react";
import { Package, CircleCheck, CircleAlert, CircleOff } from "lucide-react";

export default function ProductStatsBar({ stats }) {
  const items = [
    {
      label: "Total",
      value: stats?.total ?? 0,
      Icon: Package,
      accent: "text-slate-800",
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
    {
      value: stats?.available ?? 0,
      Icon: CircleCheck,
      accent: "text-emerald-700",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      label: "Disponibles",
    },
    {
      label: "Agotados",
      value: stats?.soldOut ?? 0,
      Icon: CircleAlert,
      accent: "text-amber-700",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      label: "Ocultos",
      value: stats?.hidden ?? 0,
      Icon: CircleOff,
      accent: "text-slate-600",
      iconBg: "bg-slate-100",
      iconColor: "text-slate-500",
    },
  ];

  return (
    <div className="flex items-stretch gap-3 flex-wrap">
      {items?.map((item, i) => {
        const LucideIcon = item.Icon;
        return (
          <div
            key={i}
            className="flex items-center gap-3 min-w-[140px] pl-4 pr-5 py-3.5 rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-200/40"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}
              aria-hidden
            >
              <LucideIcon className={`h-5 w-5 ${item.iconColor}`} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span
                className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${item.accent}`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {item?.value}
              </span>
              <span
                className="text-xs font-medium text-slate-500"
                style={{ fontFamily: "var(--font-caption)" }}
              >
                {item?.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
