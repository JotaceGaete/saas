/**
 * Walinka Business Engine
 *
 * Función pura que dado un Blueprint y Goals devuelve la configuración completa
 * del negocio. Es la única fuente de inteligencia del producto.
 *
 * No depende de React. No depende de Supabase.
 * Todo el frontend y backend consume este motor — no al revés.
 */

import { getBlueprint } from './blueprints/index.js';
import { resolveOutputsFromGoals, resolvePagesFromGoals } from './goals/index.js';
import { resolveOutputsWithDependencies, OUTPUTS } from './outputs/index.js';
import { resolveStage, getNextStageHint } from './stages/index.js';

/**
 * @typedef {Object} BusinessData
 * @property {string} name          - Nombre del negocio
 * @property {string} [city]        - Ciudad
 * @property {string} [phone]       - Teléfono de WhatsApp
 * @property {string} [logoUrl]     - URL del logo
 * @property {string} [countryCode] - ISO 3166-1 alpha-2
 */

/**
 * @typedef {Object} BusinessConfig
 * @property {string}   blueprint
 * @property {string[]} goals
 * @property {string[]} outputs         - outputs activos (con dependencias resueltas)
 * @property {number}   stage           - 0-4
 * @property {string|null} nextStageHint
 * @property {Object}   website
 * @property {string[]} website.pages
 * @property {string}   website.layout
 * @property {string}   website.theme
 * @property {Object}   website.initialCopy
 * @property {Object[]} menu            - ítems del menú lateral de la app
 */

/**
 * Genera la configuración completa de un negocio a partir de su Blueprint y Goals.
 *
 * @param {string}      blueprintSlug
 * @param {string[]}    goalSlugs
 * @param {BusinessData} [businessData]
 * @returns {BusinessConfig}
 */
export function createBusinessConfig(blueprintSlug, goalSlugs, businessData = {}) {
  const blueprint = getBlueprint(blueprintSlug);

  // Resolver outputs desde goals + dependencias transitivas
  const rawOutputs = resolveOutputsFromGoals(goalSlugs);
  const outputs = resolveOutputsWithDependencies(rawOutputs);

  // Resolver páginas del sitio desde goals
  const pages = resolvePagesFromGoals(goalSlugs);

  // Asegurar que si website está activo, home y contact estén siempre
  if (outputs.includes('website')) {
    if (!pages.includes('home')) pages.unshift('home');
    if (!pages.includes('contact')) pages.push('contact');
  }

  // Stage actual
  const stage = resolveStage(outputs);
  const nextStageHint = getNextStageHint(outputs);

  // Menú lateral: solo outputs activos en orden de OUTPUT_SLUGS
  const menu = outputs.map(slug => ({
    slug,
    label: OUTPUTS[slug].label,
    icon: OUTPUTS[slug].icon,
    path: OUTPUTS[slug].menuPath,
  }));

  // Copy inicial del sitio generado por el Blueprint
  const biz = { name: 'Mi negocio', ...businessData };
  const initialCopy = blueprint.initialCopy(biz);

  return {
    blueprint: blueprint.slug,
    goals: goalSlugs,
    outputs,
    stage,
    nextStageHint,
    website: {
      pages,
      layout: blueprint.website.layout,
      theme: blueprint.website.theme,
      initialCopy,
    },
    menu,
  };
}

/**
 * Agrega un Goal a una configuración existente y retorna la nueva configuración.
 * Los Goals son aditivos: nunca desactivan Outputs existentes.
 *
 * @param {BusinessConfig} currentConfig
 * @param {string} newGoalSlug
 * @param {BusinessData} [businessData]
 * @returns {BusinessConfig}
 */
export function addGoalToConfig(currentConfig, newGoalSlug, businessData = {}) {
  const goals = [...new Set([...currentConfig.goals, newGoalSlug])];
  return createBusinessConfig(currentConfig.blueprint, goals, businessData);
}
