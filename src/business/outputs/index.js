/**
 * OUTPUT_DEFINITIONS
 * Las 8 herramientas que Walinka puede activar para un negocio.
 * El usuario las ve en el menú lateral como herramientas — nunca como "outputs activados".
 */

export const OUTPUTS = Object.freeze({
  website: {
    slug: 'website',
    label: 'Sitio web',
    icon: 'Globe',
    menuPath: '/sitio',
    dependsOn: [],
    connectsTo: ['catalog'],
  },

  catalog: {
    slug: 'catalog',
    label: 'Catálogo',
    icon: 'ShoppingBag',
    menuPath: '/catalogo',
    dependsOn: [],
    connectsTo: ['website', 'whatsapp', 'tpv', 'stock'],
  },

  whatsapp: {
    slug: 'whatsapp',
    label: 'WhatsApp',
    icon: 'MessageCircle',
    menuPath: '/whatsapp',
    dependsOn: [],
    connectsTo: ['catalog'],
  },

  crm: {
    slug: 'crm',
    label: 'Clientes',
    icon: 'Users',
    menuPath: '/crm',
    dependsOn: [],
    connectsTo: ['tpv', 'caja'],
  },

  tpv: {
    slug: 'tpv',
    label: 'Punto de venta',
    icon: 'ShoppingCart',
    menuPath: '/tpv',
    dependsOn: ['caja'],
    connectsTo: ['catalog', 'crm', 'caja'],
  },

  caja: {
    slug: 'caja',
    label: 'Caja',
    icon: 'DollarSign',
    menuPath: '/caja',
    dependsOn: [],
    connectsTo: ['tpv', 'crm'],
  },

  stock: {
    slug: 'stock',
    label: 'Inventario',
    icon: 'Package',
    menuPath: '/stock',
    dependsOn: [],
    connectsTo: ['catalog'],
  },

  dashboard: {
    slug: 'dashboard',
    label: 'Resumen',
    icon: 'BarChart2',
    menuPath: '/',
    dependsOn: [],
    connectsTo: ['website', 'catalog', 'whatsapp', 'crm', 'tpv', 'caja', 'stock'],
  },
});

export const OUTPUT_SLUGS = Object.freeze(Object.keys(OUTPUTS));

export function getOutput(slug) {
  return OUTPUTS[slug] ?? null;
}

/**
 * Dado un array de Outputs a activar, resuelve el array completo incluyendo
 * las dependencias transitivas. El Dashboard siempre se incluye.
 */
export function resolveOutputsWithDependencies(outputSlugs) {
  const resolved = new Set(['dashboard']);
  const queue = [...outputSlugs];

  while (queue.length > 0) {
    const slug = queue.shift();
    if (resolved.has(slug)) continue;
    resolved.add(slug);
    const output = OUTPUTS[slug];
    if (output?.dependsOn) {
      for (const dep of output.dependsOn) {
        if (!resolved.has(dep)) queue.push(dep);
      }
    }
  }

  // Preserve menu order from OUTPUT_SLUGS
  return OUTPUT_SLUGS.filter(s => resolved.has(s));
}
