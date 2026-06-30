/**
 * STAGE_DEFINITIONS
 * Las 4 etapas de evolución de un negocio en Walinka.
 * Los Stages son internos — el usuario nunca ve "Stage 2".
 * Solo ve sugerencias como "Activá tu catálogo para vender por WhatsApp".
 */

export const STAGES = Object.freeze([
  {
    stage: 1,
    name: 'Presencia',
    description: 'Tus clientes pueden encontrarte en internet.',
    requiredOutputs: ['website'],
    hint: 'Publicá tu sitio web para que tus clientes te encuentren.',
  },
  {
    stage: 2,
    name: 'Ventas',
    description: 'Estás generando pedidos o contactos desde Walinka.',
    requiredOutputs: ['catalog', 'whatsapp'],
    hint: 'Activá tu catálogo y WhatsApp para empezar a recibir pedidos.',
  },
  {
    stage: 3,
    name: 'Gestión',
    description: 'Tenés control de tus clientes y tu dinero.',
    requiredOutputs: ['crm', 'caja'],
    hint: 'Empezá a registrar clientes y llevar tu caja.',
  },
  {
    stage: 4,
    name: 'Crecimiento',
    description: 'Tomás decisiones con datos reales de tu negocio.',
    requiredOutputs: ['stock', 'dashboard'],
    hint: 'Activá el inventario y revisá tus métricas para crecer.',
  },
]);

/**
 * Dado el array de Outputs activos, determina en qué Stage se encuentra el negocio.
 * Un Stage se considera alcanzado cuando todos sus requiredOutputs están activos.
 * El Stage del negocio es el más alto que alcanzó (no retrocede).
 */
export function resolveStage(activeOutputSlugs) {
  const active = new Set(activeOutputSlugs);
  let currentStage = 0;
  for (const { stage, requiredOutputs } of STAGES) {
    if (requiredOutputs.every(o => active.has(o))) {
      currentStage = stage;
    }
  }
  return currentStage;
}

/**
 * Retorna el hint del próximo Stage, o null si ya está en el Stage máximo.
 */
export function getNextStageHint(activeOutputSlugs) {
  const current = resolveStage(activeOutputSlugs);
  const next = STAGES.find(s => s.stage === current + 1);
  return next?.hint ?? null;
}
