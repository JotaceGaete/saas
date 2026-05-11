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
    <div className="dashboard-premium-card dashboard-premium-card--glass relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Icon name="Sparkles" size={14} color="#FFFFFF" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>Copilot</p>
              <h3 className="text-[15px] font-bold" style={{ color: '#FFFFFF', fontFamily: 'var(--font-heading)' }}>Recomendacion IA</h3>
            </div>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: '#D1D5DB', fontFamily: 'var(--font-caption)' }}>
              Leyendo la actividad del dia...
            </p>
          ) : (
            <div>
              <p className="max-w-3xl text-lg font-bold leading-snug sm:text-[1.45rem]" style={{ color: '#FFFFFF', fontFamily: 'var(--font-heading)' }}>
                {hallazgo}
              </p>
              <div className="mt-5 pl-4" style={{ borderLeft: '2px solid rgba(255,255,255,0.28)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>Siguiente accion sugerida</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed" style={{ color: '#E5E7EB', fontFamily: 'var(--font-body)' }}>{accion}</p>
              </div>
              {data?.alerta && (
                <p className="mt-3 text-sm" style={{ color: '#D1D5DB', fontFamily: 'var(--font-caption)' }}>{data.alerta}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:flex-col md:items-end">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#F9FAFB', fontFamily: 'var(--font-caption)' }}>
            {priorityLabel}
          </span>
          <span className="text-xs" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>{updatedLabel}</span>
        </div>
      </div>
    </div>
  );
}
