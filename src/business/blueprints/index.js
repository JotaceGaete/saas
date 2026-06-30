/**
 * BLUEPRINT_DEFINITIONS
 * Los 5 tipos de negocio que Walinka soporta en v1.
 * Cada Blueprint define estrategia, tono, y configuración por defecto.
 * El usuario los ve como "Tipo de negocio" — nunca como "Blueprint".
 */

export const BLUEPRINTS = Object.freeze({
  tienda: {
    slug: 'tienda',
    label: 'Tienda',
    icon: '🛍',
    description: 'Ropa, electrónica, librería, ferretería o cualquier comercio minorista.',
    defaultGoals: ['find_me', 'show_products', 'sell_whatsapp'],
    availableGoals: ['find_me', 'show_products', 'sell_whatsapp', 'manage_clients', 'control_sales', 'manage_inventory', 'sell_in_person'],
    website: {
      layout: 'product_first',
      theme: 'clean',
    },
    initialCopy: (biz) => ({
      heroTitle: biz.name,
      heroSubtitle: 'Encontrá todo lo que necesitás',
      ctaLabel: 'Ver productos',
      aboutTitle: `Sobre ${biz.name}`,
    }),
  },

  restaurante: {
    slug: 'restaurante',
    label: 'Restaurante',
    icon: '🍽',
    description: 'Restaurante, cafetería, food truck, rotisería o catering.',
    defaultGoals: ['find_me', 'show_products', 'sell_whatsapp'],
    availableGoals: ['find_me', 'show_products', 'sell_whatsapp', 'manage_clients', 'control_sales', 'sell_in_person'],
    website: {
      layout: 'restaurant_menu',
      theme: 'warm',
    },
    initialCopy: (biz) => ({
      heroTitle: biz.name,
      heroSubtitle: 'Pedí por WhatsApp o visitanos',
      ctaLabel: 'Ver menú',
      aboutTitle: `Nuestra cocina`,
    }),
  },

  servicios: {
    slug: 'servicios',
    label: 'Servicios',
    icon: '🔧',
    description: 'Plomero, electricista, limpieza, reparaciones, delivery u otros servicios.',
    defaultGoals: ['find_me', 'show_products'],
    availableGoals: ['find_me', 'show_products', 'sell_whatsapp', 'manage_clients', 'control_sales'],
    website: {
      layout: 'service_first',
      theme: 'professional',
    },
    initialCopy: (biz) => ({
      heroTitle: biz.name,
      heroSubtitle: 'Servicio rápido y confiable',
      ctaLabel: 'Pedir presupuesto',
      aboutTitle: `¿Por qué elegirnos?`,
    }),
  },

  belleza: {
    slug: 'belleza',
    label: 'Belleza',
    icon: '💅',
    description: 'Peluquería, barbería, estética, manicura, spa o maquillaje.',
    defaultGoals: ['find_me', 'show_products', 'manage_clients'],
    availableGoals: ['find_me', 'show_products', 'sell_whatsapp', 'manage_clients', 'control_sales', 'sell_in_person'],
    website: {
      layout: 'gallery_first',
      theme: 'elegant',
    },
    initialCopy: (biz) => ({
      heroTitle: biz.name,
      heroSubtitle: 'Turno por WhatsApp',
      ctaLabel: 'Sacar turno',
      aboutTitle: `Nuestros trabajos`,
    }),
  },

  profesional: {
    slug: 'profesional',
    label: 'Profesional',
    icon: '👨‍💼',
    description: 'Abogado, contador, psicólogo, coach, consultor o freelance.',
    defaultGoals: ['find_me', 'manage_clients'],
    availableGoals: ['find_me', 'show_products', 'sell_whatsapp', 'manage_clients', 'control_sales'],
    website: {
      layout: 'personal_brand',
      theme: 'corporate',
    },
    initialCopy: (biz) => ({
      heroTitle: biz.name,
      heroSubtitle: 'Profesional independiente',
      ctaLabel: 'Contactar',
      aboutTitle: `Mi trayectoria`,
    }),
  },
});

export const BLUEPRINT_SLUGS = Object.freeze(Object.keys(BLUEPRINTS));

export function getBlueprint(slug) {
  return BLUEPRINTS[slug] ?? BLUEPRINTS.servicios;
}
