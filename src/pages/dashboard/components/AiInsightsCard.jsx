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
    <div className="dashboard-premium-card dashboard-premium-card--glass relative overflow-hidden rounded-[18px] p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.09)' }}>
              <Icon name="Sparkles" size={15} color="#FFFFFF" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>Copilot</p>
              <h3 className="text-base font-bold" style={{ color: '#FFFFFF', fontFamily: 'var(--font-heading)' }}>Recomendacion IA</h3>
            </div>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: '#D1D5DB', fontFamily: 'var(--font-caption)' }}>
              Leyendo la actividad del dia...
            </p>
          ) : (
            <div>
              <p className="max-w-3xl text-xl font-bold leading-snug sm:text-2xl" style={{ color: '#FFFFFF', fontFamily: 'var(--font-heading)' }}>
                {hallazgo}
              </p>
              <div className="mt-5 rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs font-semibold uppercase" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>Siguiente accion</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: '#E5E7EB', fontFamily: 'var(--font-body)' }}>{accion}</p>
              </div>
              {data?.alerta && (
                <p className="mt-3 text-sm" style={{ color: '#D1D5DB', fontFamily: 'var(--font-caption)' }}>{data.alerta}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:flex-col md:items-end">
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'var(--font-caption)' }}>
            {priorityLabel}
          </span>
          <span className="text-xs" style={{ color: '#9CA3AF', fontFamily: 'var(--font-caption)' }}>{updatedLabel}</span>
        </div>
      </div>
    </div>
  );
}
