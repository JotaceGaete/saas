/**
 * Reglas de producto: cuándo se puede cambiar el país persistido del negocio
 * sin romper facturación. Usar junto con `resolveCountryState` (state-model.js).
 */
import { getEffectivePlanSlug } from '../../services/waBusinessService';

const DEBUG_PREFIX = '[VENTALINK_BUSINESS_COUNTRY_POLICY]';

/**
 * Única condición “configurado”: columna `country_code` en BD presente y no vacía.
 * Ignora `country` legacy y moneda; no valida lista ISO aquí (eso es UI/planes).
 */
export function hasPersistedBusinessCountry(business) {
  const raw = business?.countryCodeDb ?? business?.country_code;
  if (raw == null) return false;
  return String(raw).trim() !== '';
}

/**
 * Campos mínimos que deben estar completos para acceder al dashboard.
 * Devuelve array de claves faltantes (vacío = completo).
 */
export function getMissingOnboardingFields(business) {
  const missing = [];
  if (!hasPersistedBusinessCountry(business)) missing.push('country');
  if (!String(business?.name ?? '').trim()) missing.push('name');
  if (!String(business?.whatsapp ?? '').trim()) missing.push('whatsapp');
  return missing;
}

/**
 * True si el negocio tiene los 3 datos mínimos para operar: país, nombre y WhatsApp.
 */
export function isOnboardingComplete(business) {
  return getMissingOnboardingFields(business).length === 0;
}

/**
 * “Bloqueo” por billing para UI de cambio de país (no aplica a la primera fijación).
 * Solo cuando la política denie explícitamente un cambio ya existente.
 */
export function isBusinessCountryEditLockedByBilling(policy) {
  if (!policy?.code) return false;
  return policy.code === 'active_paid_or_trial_plan' || policy.code === 'scheduled_paid_plan';
}

/**
 * Evalúa si se permite cambiar `country_code` desde la app (configuración).
 * No sustituye validación server-side; evita cambios silenciosos peligrosos en UI.
 *
 * @param {object|null|undefined} business - fila mapeada de wa_businesses
 * @returns {{ allowed: boolean, code: string|null, userMessage: string|null, debug: object }}
 */
export function evaluateBusinessCountryChangePolicy(business) {
  if (!business?.id) {
    const out = {
      allowed: false,
      code: 'no_business',
      userMessage: 'No hay negocio cargado.',
      debug: {},
    };
    if (typeof window !== 'undefined' && window.__VENTALINK_COUNTRY_DEBUG__) {
      console.info(DEBUG_PREFIX, 'deny', out);
    }
    return out;
  }

  /** Primera fijación de país: siempre permitida; el bloqueo por plan/billing aplica solo al cambiar un país ya persistido. */
  if (!hasPersistedBusinessCountry(business)) {
    const out = {
      allowed: true,
      code: null,
      userMessage: null,
      debug: { reason: 'first_country_fixation' },
    };
    if (typeof window !== 'undefined' && window.__VENTALINK_COUNTRY_DEBUG__) {
      console.info(DEBUG_PREFIX, 'allow', out);
    }
    return out;
  }

  const effectivePlan = getEffectivePlanSlug(
    business.planSlug,
    business.planExpiresAt,
    business.trialExpiresAt,
  );

  const scheduledSlug = String(business.scheduledPlanSlug || '').trim().toLowerCase();
  const scheduledAt = business.scheduledChangeAt ? new Date(business.scheduledChangeAt) : null;
  const hasFutureScheduledPaid =
    scheduledSlug &&
    scheduledSlug !== 'starter' &&
    scheduledAt &&
    !Number.isNaN(scheduledAt.getTime()) &&
    scheduledAt > new Date();

  if (hasFutureScheduledPaid) {
    const out = {
      allowed: false,
      code: 'scheduled_paid_plan',
      userMessage:
        'Tienes un cambio de plan programado. Para cambiar el país del negocio sin afectar la facturación, escribe a soporte.',
      debug: { scheduledPlanSlug: business.scheduledPlanSlug, scheduledChangeAt: business.scheduledChangeAt },
    };
    if (typeof window !== 'undefined' && window.__VENTALINK_COUNTRY_DEBUG__) {
      console.info(DEBUG_PREFIX, 'deny', out);
    }
    return out;
  }

  if (effectivePlan === 'pro' || effectivePlan === 'business') {
    const out = {
      allowed: false,
      code: 'active_paid_or_trial_plan',
      userMessage:
        'Tienes un plan de pago o período de prueba activo. Cambiar el país puede afectar moneda, métodos de pago y facturación. Para cambiar de mercado, contacta a soporte.',
      debug: { effectivePlan, planExpiresAt: business.planExpiresAt, trialExpiresAt: business.trialExpiresAt },
    };
    if (typeof window !== 'undefined' && window.__VENTALINK_COUNTRY_DEBUG__) {
      console.info(DEBUG_PREFIX, 'deny', out);
    }
    return out;
  }

  const out = {
    allowed: true,
    code: null,
    userMessage: null,
    debug: { effectivePlan },
  };
  if (typeof window !== 'undefined' && window.__VENTALINK_COUNTRY_DEBUG__) {
    console.info(DEBUG_PREFIX, 'allow', out);
  }
  return out;
}
