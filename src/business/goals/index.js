/**
 * GOAL_DEFINITIONS
 * Las 7 necesidades que un negocio puede tener.
 * El usuario las ve como frases en primera persona durante el onboarding.
 * Cada Goal activa un conjunto de Outputs cuando se selecciona.
 */

export const GOALS = Object.freeze({
  find_me: {
    slug: 'find_me',
    label: 'Quiero aparecer en internet',
    description: 'Que tus clientes te encuentren cuando buscan lo que ofrecés.',
    activates: ['website'],
    websitePages: ['home', 'contact'],
  },

  show_products: {
    slug: 'show_products',
    label: 'Quiero mostrar mis productos o servicios',
    description: 'Un catálogo visual de lo que vendés o hacés.',
    activates: ['catalog', 'website'],
    websitePages: ['products'],
  },

  sell_whatsapp: {
    slug: 'sell_whatsapp',
    label: 'Quiero vender o recibir pedidos por WhatsApp',
    description: 'Tus clientes eligen del catálogo y te contactan directo.',
    activates: ['catalog', 'whatsapp'],
    websitePages: [],
  },

  manage_clients: {
    slug: 'manage_clients',
    label: 'Quiero organizar mis clientes',
    description: 'Cartera de clientes, historial de compras y seguimiento.',
    activates: ['crm'],
    websitePages: [],
  },

  control_sales: {
    slug: 'control_sales',
    label: 'Quiero controlar mis ventas',
    description: 'Facturas, cobros y reportes de lo que ingresa.',
    activates: ['crm', 'dashboard'],
    websitePages: [],
  },

  manage_inventory: {
    slug: 'manage_inventory',
    label: 'Quiero llevar mi inventario',
    description: 'Saber cuánto stock tenés y recibir alertas cuando baja.',
    activates: ['stock', 'catalog'],
    websitePages: [],
  },

  sell_in_person: {
    slug: 'sell_in_person',
    label: 'Quiero cobrar en mi local',
    description: 'Punto de venta para cobrar en efectivo, tarjeta o transferencia.',
    activates: ['tpv', 'caja'],
    websitePages: [],
  },
});

export const GOAL_SLUGS = Object.freeze(Object.keys(GOALS));

export function getGoal(slug) {
  return GOALS[slug] ?? null;
}

/**
 * Dado un array de Goals, retorna el array deduplicado de Outputs que deben activarse.
 */
export function resolveOutputsFromGoals(goalSlugs) {
  const outputs = new Set();
  for (const slug of goalSlugs) {
    const goal = GOALS[slug];
    if (!goal) continue;
    for (const output of goal.activates) outputs.add(output);
  }
  return [...outputs];
}

/**
 * Dado un array de Goals, retorna el array deduplicado de páginas del sitio que deben crearse.
 */
export function resolvePagesFromGoals(goalSlugs) {
  const pages = new Set();
  for (const slug of goalSlugs) {
    const goal = GOALS[slug];
    if (!goal) continue;
    for (const page of goal.websitePages) pages.add(page);
  }
  return [...pages];
}
