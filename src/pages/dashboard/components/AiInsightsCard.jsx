import React from "react";

const PRIORITY_STYLES = {
  alta: { label: 'Prioridad Alta', badge: 'text-red-600 bg-red-50 border-red-100' },
  media: { label: 'Prioridad Media', badge: 'text-amber-700 bg-amber-50 border-amber-100' },
  baja: { label: 'Prioridad Baja', badge: 'text-green-600 bg-green-50 border-green-100' },
};

export default function AiInsightsCard({ data, loading }) {
  const priorityKey = String(data?.prioridad || 'baja').toLowerCase();
  const priority = PRIORITY_STYLES[priorityKey] || PRIORITY_STYLES.baja;
  const hallazgo = data?.hallazgo || data?.hallazgo_principal || 'Sin datos suficientes por ahora.';
  const accion = data?.accion || data?.accion_recomendada || 'Mantener monitoreo diario del dashboard.';
  const generatedAt = data?.generated_at ? new Date(data.generated_at) : null;
  const updatedLabel = generatedAt
    ? `Actualizado ${generatedAt.toLocaleDateString('es-CL')} ${generatedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
    : 'Actualizado hoy';

  return (
    <div className="dashboard-premium-card dashboard-premium-card--glass relative overflow-hidden rounded-2xl border border-white/25 p-6">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" aria-hidden />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="p-2 bg-purple-100 rounded-lg text-purple-600 text-base leading-none" aria-hidden>✨</span>
          <h3 className="font-bold text-gray-800" style={{ fontFamily: 'var(--font-heading)' }}>
            Insight IA
          </h3>
          <span
            className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${priority.badge}`}
            style={{ fontFamily: 'var(--font-caption)' }}
          >
            {priority.label}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-600" style={{ fontFamily: 'var(--font-caption)' }}>
            Cargando insight del día...
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-caption)' }}>
              <strong className="text-gray-900">Hallazgo:</strong> {hallazgo}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-caption)' }}>
              <strong className="text-gray-900">Alerta:</strong> {data?.alerta || 'Sin alertas críticas.'}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-caption)' }}>
              <strong className="text-gray-900">Acción:</strong> {accion}
            </p>
            <p className="text-xs pt-1 text-gray-500" style={{ fontFamily: 'var(--font-caption)' }}>
              {updatedLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
