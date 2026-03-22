/**
 * Bloque "Sobre este catálogo": copy dinámico por tipo de negocio (rubro + categorías de productos).
 */

import { isRestaurantBusiness } from './businessType';

/** @typedef {'moda'|'comida'|'servicio'|'general'} CatalogAboutKind */

function normalizeHaystack(s) {
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const KW = {
  moda: [
    'ropa',
    'moda',
    'indumentaria',
    'textil',
    'vestuario',
    'calzado',
    'accesorio',
    'boutique',
    'prenda',
    'jean',
    'remera',
    'polera',
    'vestido',
    'abrigo',
    'camisa',
    'pantalon',
    'pantalón',
    'fashion',
  ],
  comida: [
    'comida',
    'bebida',
    'restaurant',
    'restaurante',
    'gastronom',
    'menu',
    'menú',
    'delivery',
    'alimento',
    'cafeteria',
    'cafetería',
    'food',
    'bar',
    'panader',
    'pasteler',
    'pizza',
    'helado',
    'jugo',
    'cocina',
    'minimarket',
    'dulce',
    'lunch',
  ],
  servicio: [
    'servicio',
    'consultor',
    'consulta',
    'reparacion',
    'reparación',
    'taller',
    'belleza',
    'peluquer',
    'salon',
    'salón',
    'masaje',
    'fotograf',
    'diseño',
    'marketing',
    'salud',
    'legal',
    'clases',
    'curso',
    'mantenimiento',
    'instalacion',
    'instalación',
    'limpieza',
    'evento',
  ],
};

/**
 * @param {object} [business]
 * @param {Array<{ category?: string }>} [products]
 * @returns {CatalogAboutKind}
 */
export function inferCatalogAboutKind(business, products = []) {
  const parts = [];

  if (business?.rubroSlug) {
    parts.push(normalizeHaystack(String(business.rubroSlug).replace(/-/g, ' ')));
  }
  if (business?.rubroName) {
    parts.push(normalizeHaystack(business.rubroName));
  }

  const catWeight = new Map();
  for (const p of products || []) {
    const c = (p?.category || '').trim();
    if (!c) continue;
    const n = normalizeHaystack(c);
    catWeight.set(n, (catWeight.get(n) || 0) + 1);
  }

  const sorted = [...catWeight.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, w] of sorted.slice(0, 8)) {
    parts.push(cat);
    if (w > 1) parts.push(cat);
  }

  const hay = parts.join(' ');

  const score = { moda: 0, comida: 0, servicio: 0 };
  for (const k of KW.moda) {
    if (hay.includes(k)) score.moda += 2;
  }
  for (const k of KW.comida) {
    if (hay.includes(k)) score.comida += 2;
  }
  for (const k of KW.servicio) {
    if (hay.includes(k)) score.servicio += 2;
  }

  if (isRestaurantBusiness(business)) {
    score.comida += 4;
  }

  const order = ['comida', 'moda', 'servicio'];
  let best = 'general';
  let bestScore = 0;
  for (const kind of order) {
    if (score[kind] > bestScore) {
      bestScore = score[kind];
      best = kind;
    }
  }

  if (bestScore === 0) return 'general';
  return /** @type {CatalogAboutKind} */ (best);
}

/**
 * @param {{ storeName?: string, city?: string, region?: string, country?: string, currency?: string, host?: string }} seoInput
 * @param {CatalogAboutKind} [kind]
 * @returns {{ intro: string, bullets: [string, string, string], closing: string }}
 */
export function buildCatalogAboutBlock(seoInput, kind = 'general') {
  const name = (seoInput.storeName || 'este negocio').trim() || 'este negocio';
  const k = kind || 'general';

  const byKind = {
    moda: {
      intro: `En este catálogo de ${name} puedes ver las prendas disponibles, revisar precios y elegir tu estilo fácilmente.`,
      bullets: [
        'Compra directa por WhatsApp',
        'Consulta tallas y disponibilidad',
        'Atención rápida',
      ],
      closing: 'Haz tu pedido en minutos y coordina directamente con el negocio.',
    },
    comida: {
      intro: `Aquí puedes revisar el menú de ${name}, ver precios y hacer tu pedido de forma rápida.`,
      bullets: ['Pedido directo por WhatsApp', 'Atención inmediata', 'Ideal para compras rápidas'],
      closing: 'Elige lo que quieres y coordina en pocos minutos desde tu celular.',
    },
    servicio: {
      intro: `En este catálogo de ${name} puedes conocer los servicios disponibles y solicitar información fácilmente.`,
      bullets: ['Contacto directo por WhatsApp', 'Respuestas rápidas', 'Atención personalizada'],
      closing: 'Escríbenos y coordina sin complicaciones.',
    },
    general: {
      intro: `En este catálogo de ${name} puedes ver los productos disponibles, revisar precios y hacer tu pedido fácilmente.`,
      bullets: ['Compra directa por WhatsApp', 'Sin registros ni pasos innecesarios', 'Atención rápida'],
      closing: 'Haz tu pedido en pocos minutos desde tu celular.',
    },
  };

  return byKind[k] || byKind.general;
}
