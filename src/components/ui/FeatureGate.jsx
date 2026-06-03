import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { usePlanFeature, useFeatureMinPlan } from 'hooks/usePlanFeature';
import { PLAN_LABELS } from 'constants/plans';

// Beneficios visibles por feature cuando el acceso está bloqueado
const FEATURE_COPY = {
  invoices:          { title: 'Notas de venta',           benefits: ['Convierte presupuestos en ventas', 'Seguimiento de pagos', 'Historial completo'] },
  customerAccount:   { title: 'Cuenta corriente',         benefits: ['Registra abonos parciales', 'Control de deuda por cliente', 'Historial de pagos'] },
  barcodePrinting:   { title: 'Códigos de barras',        benefits: ['Genera EAN-13 internos', 'Asocia códigos a productos', 'Búsqueda por escáner en TPV'] },
  labelPrinting:     { title: 'Impresión de etiquetas',   benefits: ['Etiquetas 30×20 mm en A4', '4 formatos de tamaño', 'Precio y barcode en cada etiqueta'] },
  stockManagement:   { title: 'Control de stock',         benefits: ['Inventario en tiempo real', 'Stock mínimo configurable', 'Alertas de reposición'] },
  cashRegister:      { title: 'Caja diaria',              benefits: ['Apertura y cierre de caja', 'Movimientos reales', 'Resumen por método de pago'] },
  purchaseInvoices:  { title: 'Compras y facturas',       benefits: ['Registra facturas recibidas', 'IVA crédito estimado', 'Historial por proveedor'] },
  fixedCosts:        { title: 'Costos fijos',             benefits: ['Arriendo, sueldos, servicios', 'Vinculado al Termómetro', 'Por categoría'] },
  costCenter:        { title: 'Termómetro del negocio',   benefits: ['Semáforo de rentabilidad diaria', 'Costo fijo vs ventas', 'IVA neto estimado'] },
  aiAssistant:       { title: 'Asistente IA',             benefits: ['Respuestas automáticas', 'Sugerencias inteligentes', 'Ahorra tiempo de atención'] },
  advancedReports:   { title: 'Reportes avanzados',       benefits: ['Análisis de tendencias', 'Exportación de datos', 'Dashboard personalizable'] },
  customDomains:     { title: 'Dominio personalizado',    benefits: ['Tu catálogo en tu dominio', 'Marca propia', 'Mejor posicionamiento'] },
};

const PLAN_COLORS = {
  pro:      { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', icon: 'text-purple-500' },
  business: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700', icon: 'text-emerald-500' },
};

/**
 * Envuelve un componente con verificación de plan.
 * Si el usuario tiene acceso, renderiza `children`.
 * Si no, muestra una tarjeta de bloqueo con beneficios y CTA.
 *
 * @param {{ feature: string, children: React.ReactNode, fallback?: React.ReactNode, compact?: boolean }} props
 *
 * @example
 *   <FeatureGate feature="invoices">
 *     <CrmInvoices />
 *   </FeatureGate>
 */
export default function FeatureGate({ feature, children, fallback, compact = false }) {
  const hasAccess  = usePlanFeature(feature);
  const minPlan    = useFeatureMinPlan(feature);
  const navigate   = useNavigate();

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const copy   = FEATURE_COPY[feature] ?? { title: feature, benefits: [] };
  const colors = PLAN_COLORS[minPlan] ?? PLAN_COLORS.business;
  const planLabel = PLAN_LABELS[minPlan] ?? minPlan;

  if (compact) {
    return (
      <button
        onClick={() => navigate('/planes')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${colors.bg} ${colors.border} ${colors.icon}`}
      >
        <Icon name="Lock" size={11} />
        Plan {planLabel}
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border-2 ${colors.bg} ${colors.border} p-6 flex flex-col items-center text-center gap-4 max-w-sm mx-auto`}>
      {/* Icon */}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colors.badge}`}>
        <Icon name="Lock" size={24} />
      </div>

      {/* Texto */}
      <div>
        <p className="text-sm font-bold text-gray-900 mb-1">{copy.title}</p>
        <p className="text-xs text-gray-500">
          Disponible desde el plan{' '}
          <span className={`font-bold ${colors.icon}`}>{planLabel}</span>
        </p>
      </div>

      {/* Beneficios */}
      {copy.benefits.length > 0 && (
        <ul className="text-left space-y-1.5 w-full">
          {copy.benefits.map(b => (
            <li key={b} className="flex items-center gap-2 text-xs text-gray-600">
              <Icon name="CheckCircle2" size={13} className={colors.icon} />
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <button
        onClick={() => navigate('/planes')}
        className={`w-full py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${colors.btn}`}
      >
        Ver plan {planLabel} →
      </button>
    </div>
  );
}

/**
 * Versión inline para usar dentro de texto o botones.
 * Renderiza children si tiene acceso, o null si no.
 *
 * @example
 *   <FeatureGateInline feature="barcodePrinting">
 *     <button>Imprimir etiquetas</button>
 *   </FeatureGateInline>
 */
export function FeatureGateInline({ feature, children, fallback = null }) {
  const hasAccess = usePlanFeature(feature);
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
