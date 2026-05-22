import React from "react";
import Icon from "components/AppIcon";

const PRIORITY_LABELS = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export default function AiInsightsCard({ data, loading }) {
  const priorityKey = String(data?.prioridad || 'baja').toLowerCase();
  const priorityLabel = PRIORITY_LABELS[priorityKey] || PRIORITY_LABELS.baja;
  const hallazgo = data?.hallazgo || data?.hallazgo_principal || 'Sin datos suficientes por ahora.';
  const accion = data?.accion || data?.accion_recomendada || 'Mantener monitoreo diario del dashboard.';
  const isLocal = data?.source === 'local';
  const generatedAt = data?.generated_at ? new Date(data.generated_at) : null;
  const updatedLabel = isLocal
    ? 'Analisis en tiempo real'
    : generatedAt
    ? `IA - ${generatedAt.toLocaleDateString('es-CL')} ${generatedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
    : 'Actualizado hoy';

  return (
    <div className="dashboard-premium-card relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: '#111827' }}>
              <Icon name="Sparkles" size={14} color="#FFFFFF" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Copilot</p>
              <h3 className="text-base font-black" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>Prioridad de hoy</h3>
            </div>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Leyendo la actividad del día...
            </p>
          ) : (
            <div>
              <p className="max-w-3xl text-lg font-black leading-snug sm:text-[1.45rem]" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                {hallazgo}
              </p>
              <div className="mt-5 rounded-2xl px-4 py-3" style={{ backgroundColor: '#F6F7FB', borderLeft: '2px solid #111827' }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Siguiente accion sugerida</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>{accion}</p>
              </div>
              {data?.alerta && (
                <p className="mt-3 text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{data.alerta}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:flex-col md:items-end">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: priorityKey === 'alta' ? 'rgba(245,158,11,0.12)' : '#F1F5F9', color: priorityKey === 'alta' ? '#92400E' : '#334155', fontFamily: 'var(--font-caption)' }}>
            {priorityLabel}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{updatedLabel}</span>
        </div>
      </div>
    </div>
  );
}
