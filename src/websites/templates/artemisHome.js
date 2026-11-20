// Contrato versionado de la plantilla `artemis-home` (Walinka Websites, fase 1).
//
// Qué edita el comercio: solo textos, imágenes y destinos de las dos secciones editoriales
// de la portada de Artemis. Posición, columnas, estilos y diseño son fijos en la plantilla.
//
// Esta validación es un espejo de las funciones SQL de la migración
// (wa_site_content_v1_is_valid). La validación autoritativa es la de la base de datos
// al publicar; esta sirve para dar feedback inmediato en el editor.

export const ARTEMIS_HOME_TEMPLATE_KEY = 'artemis-home';
export const ARTEMIS_HOME_CONTRACT_VERSION = 1;

// Dominio multimedia autorizado (host público de R2 usado por las imágenes de Walinka).
export const AUTHORIZED_IMAGE_HOST = 'media.gong.cl';
const IMAGE_URL_RE = /^https:\/\/media\.gong\.cl\/[A-Za-z0-9._~/%-]+$/;
// Ruta interna: empieza con "/", no es "//" y no contiene barras invertidas.
const HREF_RE = /^\/(?!\/)[^\\]*$/;

const LIMITS = {
  eyebrow: [1, 40],
  title: [1, 90],
  text: [1, 280],
  ctaLabel: [1, 30],
  alt: [1, 140],
  highlight: [1, 60],
};

// Campos editables por sección. Los `label` son los que verá el comercio.
export const ARTEMIS_HOME_SECTIONS = [
  {
    key: 'editorialIngles',
    label: 'Sección 1 · Menaje inglés',
    fields: [
      { key: 'eyebrow', label: 'Texto superior', type: 'text', limit: LIMITS.eyebrow },
      { key: 'title', label: 'Título', type: 'text', limit: LIMITS.title },
      { key: 'text', label: 'Descripción', type: 'textarea', limit: LIMITS.text },
      { key: 'image', label: 'Imagen', type: 'image' },
      { key: 'ctaLabel', label: 'Texto del botón', type: 'text', limit: LIMITS.ctaLabel },
      { key: 'href', label: 'Destino del botón (ruta interna)', type: 'href' },
      { key: 'highlights', label: 'Textos destacados (exactamente 3)', type: 'list', count: 3, limit: LIMITS.highlight },
    ],
  },
  {
    key: 'editorialVintage',
    label: 'Sección 2 · Vintage y antigüedades',
    fields: [
      { key: 'eyebrow', label: 'Texto superior', type: 'text', limit: LIMITS.eyebrow },
      { key: 'title', label: 'Título', type: 'text', limit: LIMITS.title },
      { key: 'text', label: 'Descripción', type: 'textarea', limit: LIMITS.text },
      { key: 'image', label: 'Imagen', type: 'image' },
      { key: 'ctaLabel', label: 'Texto del botón', type: 'text', limit: LIMITS.ctaLabel },
      { key: 'href', label: 'Destino del botón (ruta interna)', type: 'href' },
    ],
  },
];

// Valores iniciales: son exactamente los textos actuales de app/page.tsx en Artemis.
export function buildArtemisHomeDefaults() {
  return {
    version: '1',
    sections: {
      editorialIngles: {
        eyebrow: 'Menaje inglés reciclado',
        title: 'Lotes seleccionados con vajillas, tazas, fuentes y mucho más',
        text: 'Cada lote reúne porcelana inglesa auténtica, revisada pieza por pieza para que encuentres lo que buscas.',
        image: { url: '/images/editorial-ingles.png', alt: 'Caja de cartón con platos y tazas de porcelana inglesa' },
        ctaLabel: 'Ver menaje y cocina',
        href: '/catalogo?categoria=menaje-y-cocina',
        highlights: ['Piezas de calidad', 'Estilo inglés auténtico', 'Ideales para el hogar o tu colección'],
      },
      editorialVintage: {
        eyebrow: 'Vintage y antigüedades',
        title: 'Objetos con historia para volver a usar',
        text: 'Radios, relojes y prismáticos recuperados con cuidado para decorar tu casa con carácter.',
        image: { url: '/images/categoria-vintage.png', alt: 'Radio vintage verde menta con rejilla dorada' },
        ctaLabel: 'Explorar vintage',
        href: '/catalogo?categoria=vintage',
      },
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Longitud en caracteres (puntos de código), igual que char_length de Postgres.
function textInRange(value, [min, max]) {
  if (typeof value !== 'string') return false;
  const len = Array.from(value).length;
  return len >= min && len <= max;
}

function sameKeys(obj, expected) {
  return Object.keys(obj).sort().join(',') === [...expected].sort().join(',');
}

// Devuelve la lista de errores (vacía si el documento es válido).
// Las imágenes solo pueden venir del dominio multimedia autorizado.
export function validateArtemisHomeContent(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return ['El contenido debe ser un objeto.'];
  if (doc.version !== '1') errors.push('Versión de contrato no válida.');
  if (!isPlainObject(doc.sections)) return [...errors, 'Falta "sections".'];

  if (!sameKeys(doc, ['sections', 'version'])) errors.push('Hay claves no permitidas en la raíz.');
  if (!sameKeys(doc.sections, ['editorialIngles', 'editorialVintage'])) errors.push('Las secciones no coinciden con la plantilla.');

  for (const section of ARTEMIS_HOME_SECTIONS) {
    const data = doc.sections[section.key];
    const prefix = section.key;
    if (!isPlainObject(data)) {
      errors.push(`${prefix}: falta la sección.`);
      continue;
    }
    const expectedKeys = section.fields.map((f) => f.key);
    if (!sameKeys(data, expectedKeys)) errors.push(`${prefix}: hay claves no permitidas.`);
    for (const field of section.fields) {
      const value = data[field.key];
      if (field.type === 'text' || field.type === 'textarea') {
        if (!textInRange(value, field.limit)) errors.push(`${prefix}.${field.key}: entre ${field.limit[0]} y ${field.limit[1]} caracteres.`);
      } else if (field.type === 'href') {
        if (typeof value !== 'string' || !HREF_RE.test(value)) errors.push(`${prefix}.href: debe ser una ruta interna que empiece con "/".`);
      } else if (field.type === 'image') {
        if (!isPlainObject(value)) {
          errors.push(`${prefix}.image: falta la imagen.`);
          continue;
        }
        if (!sameKeys(value, ['alt', 'url'])) errors.push(`${prefix}.image: claves no permitidas.`);
        if (typeof value.url !== 'string' || !IMAGE_URL_RE.test(value.url)) errors.push(`${prefix}.image.url: solo imágenes de ${AUTHORIZED_IMAGE_HOST} (https).`);
        if (!textInRange(value.alt, LIMITS.alt)) errors.push(`${prefix}.image.alt: entre 1 y 140 caracteres.`);
      } else if (field.type === 'list') {
        if (!Array.isArray(value) || value.length !== field.count) {
          errors.push(`${prefix}.${field.key}: deben ser exactamente ${field.count} textos.`);
        } else if (!value.every((item) => textInRange(item, field.limit))) {
          errors.push(`${prefix}.${field.key}: cada texto entre 1 y 60 caracteres.`);
        }
      }
    }
  }
  return errors;
}

// Borrador inicial del editor: mismos textos que la portada actual, pero sin imagen.
// Las imágenes de Artemis son archivos locales de su repo y no existen en Walinka,
// así que el comercio debe subir sus imágenes (R2) antes de poder publicar.
export function buildEditorInitialDraft() {
  const draft = buildArtemisHomeDefaults();
  for (const section of Object.values(draft.sections)) {
    section.image = { url: '', alt: section.image.alt };
  }
  return draft;
}
