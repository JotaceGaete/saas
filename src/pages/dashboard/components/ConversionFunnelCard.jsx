import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatCurrency } from "../../../utils/formatCLP";

const RANGE_OPTIONS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

function formatPct(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
}

export default function ConversionFunnelCard({
  data,
  loading,
  range = "7d",
  onRangeChange,
  currency = "CLP",
}) {
  if (loading) return <SkeletonCard />;

  const visits = Number(data?.visits ?? 0);
  const clicksWhatsapp = Number(data?.clicksWhatsapp ?? 0);
  const orders = Number(data?.orders ?? 0);
  const paid = Number(data?.paid ?? 0);
  const avgTicket = Number(data?.avgPaidTicket ?? 0);
  const rateClickFromVisit = Number(data?.rateClickFromVisit ?? 0);
  const rateOrderFromClick = Number(data?.rateOrderFromClick ?? 0);
  const rateOrderFromVisit = Number(data?.rateOrderFromVisit ?? 0);
  const ratePaidFromOrder = Number(data?.ratePaidFromOrder ?? 0);
  const ratePaidFromVisit = Number(data?.ratePaidFromVisit ?? 0);
  const deltaPaidRevenueAmount = Number(data?.deltas?.paidRevenue?.amount ?? 0);
  const deltaPaidRevenue = Number(data?.deltas?.paidRevenue?.percent ?? 0);
  const deltaPaidRevenueUp = deltaPaidRevenue >= 0;
  const deltaLabel = data?.deltas?.label || 'vs período anterior';

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: "#FFFFFF", borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}>
            Embudo de conversión
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-caption)" }}>
            Visitas -> Click WhatsApp -> Pedidos -> Pagados
          </p>
        </div>
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onRangeChange?.(opt.key)}
                className="px-2 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{
                  fontFamily: "var(--font-caption)",
                  backgroundColor: active ? "rgba(124,58,237,0.12)" : "transparent",
                  color: active ? "var(--color-primary)" : "var(--color-muted-foreground)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-caption)" }}>Visitas</p>
          <p className="text-lg font-bold" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-heading)" }}>{visits}</p>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-caption)" }}>Clicks WA</p>
          <p className="text-lg font-bold" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-heading)" }}>{clicksWhatsapp}</p>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-caption)" }}>Pedidos</p>
          <p className="text-lg font-bold" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-heading)" }}>{orders}</p>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-caption)" }}>Pagados</p>
          <p className="text-lg font-bold" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-heading)" }}>{paid}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.10)", color: "#B45309", fontFamily: "var(--font-caption)" }}>
          Visita -> Click: {formatPct(rateClickFromVisit)}
        </span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(236,72,153,0.10)", color: "#BE185D", fontFamily: "var(--font-caption)" }}>
          Click -> Pedido: {formatPct(rateOrderFromClick)}
        </span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(14,165,233,0.10)", color: "#0284C7", fontFamily: "var(--font-caption)" }}>
          Visita -> Pedido: {formatPct(rateOrderFromVisit)}
        </span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(16,185,129,0.10)", color: "#059669", fontFamily: "var(--font-caption)" }}>
          Pedido -> Pagado: {formatPct(ratePaidFromOrder)}
        </span>
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(124,58,237,0.10)", color: "var(--color-primary)", fontFamily: "var(--font-caption)" }}>
          Total: {formatPct(ratePaidFromVisit)}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
        <Icon name="Receipt" size={13} color="var(--color-muted-foreground)" />
        <p className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-caption)" }}>
          Ticket promedio pagado: <strong>{formatCurrency(avgTicket, currency)}</strong>
        </p>
        <span
          className="text-xs px-2 py-1 rounded-full ml-auto"
          style={{
            backgroundColor: deltaPaidRevenueUp ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            color: deltaPaidRevenueUp ? '#059669' : '#DC2626',
            fontFamily: 'var(--font-caption)',
          }}
        >
          Ingresos {deltaPaidRevenueUp ? '+' : '-'}{formatCurrency(Math.abs(deltaPaidRevenueAmount), currency)} ({deltaPaidRevenueUp ? '+' : ''}{deltaPaidRevenue.toFixed(1)}%) {deltaLabel}
        </span>
      </div>
    </div>
  );
}

