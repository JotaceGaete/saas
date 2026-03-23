export const PAYPAL_CURRENCY = 'USD';
export const PAYPAL_PRODUCT_NAME = 'Ventalink';
export const PAYPAL_PRODUCT_TYPE = 'SERVICE';
export const PAYPAL_PRODUCT_CATEGORY = 'SOFTWARE';

export const INTERNAL_PLAN_SLUGS = Object.freeze({
  PRO: 'pro',
  FULL: 'full',
});

export const PAYPAL_PLAN_DEFINITIONS = Object.freeze({
  [INTERNAL_PLAN_SLUGS.PRO]: Object.freeze({
    displayName: 'Ventalink Pro Monthly',
    description: 'Ventalink Pro plan - monthly subscription',
    amountUsd: '6.00',
    intervalUnit: 'MONTH',
    intervalCount: 1,
  }),
  [INTERNAL_PLAN_SLUGS.FULL]: Object.freeze({
    displayName: 'Ventalink Full Monthly',
    description: 'Ventalink Full plan - monthly subscription',
    amountUsd: '10.00',
    intervalUnit: 'MONTH',
    intervalCount: 1,
  }),
});

