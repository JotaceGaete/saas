import React from "react";
import { Package, CircleCheck, CircleAlert, CircleOff } from "lucide-react";

export default function ProductStatsBar({ stats, productNounPlural = 'productos' }) {
  const items = [
    {
      label: productNounPlural,
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
    <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
      {items?.map((item, i) => {
        const LucideIcon = item.Icon;
        return (
          <div
            key={i}
            className="flex min-w-[132px] items-center gap-3 rounded-2xl border border-white/70 bg-white/62 py-3 pl-3.5 pr-4 shadow-[0_8px_22px_rgba(17,24,39,0.04)]"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}
              aria-hidden
            >
              <LucideIcon className={`h-4 w-4 ${item.iconColor}`} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span
                className={`text-[1.6rem] font-black tabular-nums leading-none ${item.accent}`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {item?.value}
              </span>
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
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
