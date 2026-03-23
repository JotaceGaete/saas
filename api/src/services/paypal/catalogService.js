import { paypalRequest } from '../../lib/paypal/httpClient.js';
import { getAccessToken } from './authService.js';
import {
  PAYPAL_CURRENCY,
  PAYPAL_PRODUCT_CATEGORY,
  PAYPAL_PRODUCT_NAME,
  PAYPAL_PRODUCT_TYPE,
  PAYPAL_PLAN_DEFINITIONS,
  INTERNAL_PLAN_SLUGS,
  getPaypalMode,
} from '../../config/paypal/index.js';
import {
  getPaypalCatalogByEnvironment,
  savePaypalCatalogByEnvironment,
} from '../../repositories/paypalCatalogRepository.js';

function buildAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=representation',
  };
}

export async function createProduct() {
  const { accessToken } = await getAccessToken();
  const response = await paypalRequest('/v1/catalogs/products', {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    body: JSON.stringify({
      name: PAYPAL_PRODUCT_NAME,
      type: PAYPAL_PRODUCT_TYPE,
      category: PAYPAL_PRODUCT_CATEGORY,
      description: 'Ventalink subscriptions',
    }),
  });

  if (!response.ok || !response.body?.id) {
    throw new Error(`[paypal-catalog] Product creation failed (${response.status})`);
  }

  return response.body;
}

export async function createMonthlyPlan({ productId, internalPlanSlug }) {
  const definition = PAYPAL_PLAN_DEFINITIONS[internalPlanSlug];
  if (!definition) {
    throw new Error(`[paypal-catalog] Invalid internalPlanSlug: ${internalPlanSlug}`);
  }

  const { accessToken } = await getAccessToken();
  const response = await paypalRequest('/v1/billing/plans', {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    body: JSON.stringify({
      product_id: productId,
      name: definition.displayName,
      description: definition.description,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: definition.intervalUnit,
            interval_count: definition.intervalCount,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: definition.amountUsd,
              currency_code: PAYPAL_CURRENCY,
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }),
  });

  if (!response.ok || !response.body?.id) {
    throw new Error(`[paypal-catalog] Plan creation failed for ${internalPlanSlug} (${response.status})`);
  }

  return response.body;
}

/**
 * Crea y guarda product/plan IDs para el entorno actual si no existen.
 */
export async function bootstrapCatalogIfNeeded() {
  const environment = getPaypalMode();
  const existing = await getPaypalCatalogByEnvironment(environment);
  if (existing?.productId && existing?.plans?.pro && existing?.plans?.full) {
    return {
      source: 'repository',
      environment,
      catalog: existing,
    };
  }

  const product = await createProduct();
  const proPlan = await createMonthlyPlan({
    productId: product.id,
    internalPlanSlug: INTERNAL_PLAN_SLUGS.PRO,
  });
  const fullPlan = await createMonthlyPlan({
    productId: product.id,
    internalPlanSlug: INTERNAL_PLAN_SLUGS.FULL,
  });

  const catalog = await savePaypalCatalogByEnvironment(environment, {
    productId: product.id,
    plans: {
      pro: proPlan.id,
      full: fullPlan.id,
    },
  });

  return {
    source: 'paypal',
    environment,
    catalog,
  };
}

