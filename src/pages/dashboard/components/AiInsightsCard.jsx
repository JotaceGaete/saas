import React from "react";
import Icon from "components/AppIcon";

const PRIORITY_STYLES = {
  alta: { bg: 'rgba(239,68,68,0.08)', color: '#DC2626', label: 'Alta' },
  media: { bg: 'rgba(245,158,11,0.10)', color: '#D97706', label: 'Media' },
  baja: { bg: 'rgba(16,185,129,0.10)', color: '#059669', label: 'Baja' },
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
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.10)' }}>
            <Icon name="Sparkles" size={15} color="var(--color-primary)" />
          </div>
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Insight IA
          </h3>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: priority.bg, color: priority.color, fontFamily: 'var(--font-caption)' }}>
          Prioridad {priority.label}
        </span>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Cargando insight del día...
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            <strong>Hallazgo:</strong> {hallazgo}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            <strong>Alerta:</strong> {data?.alerta || 'Sin alertas críticas.'}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            <strong>Acción:</strong> {accion}
          </p>
          <p className="text-xs pt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {updatedLabel}
          </p>
        </div>
      )}
    </div>
  );
}

