import {
  confirmBillingSubscriptionController,
  createBillingSubscriptionController,
  dlocalCheckoutController,
} from '../backend/src/controllers/billingSubscriptionsController.js';
import { dlocalBillingCallbackController } from '../backend/src/controllers/dlocalBillingCallbackController.js';
import { dlocalBillingWebhookController } from '../backend/src/controllers/dlocalBillingWebhookController.js';
import { testDlocalPaymentController } from '../backend/src/controllers/dlocalTestPaymentController.js';
import {
  getBillingSubscriptionStateController,
  getCurrentSubscriptionController,
} from '../backend/src/controllers/billingSubscriptionStateController.js';

/**
 * Consolidado: todas las rutas /api/v1/billing/* (Vercel Hobby: una sola Serverless Function).
 */
export async function GET(request) {
  const path = new URL(request.url).pathname;
  const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  if (normalizedPath.endsWith('/api/v1/billing/dlocal/callback')) {
    return dlocalBillingCallbackController(request);
  }
  if (
    normalizedPath.endsWith('/api/v1/billing/current-subscription')
    || normalizedPath.endsWith('/api/billing-current-subscription')
  ) {
    return getCurrentSubscriptionController(request);
  }
  return getBillingSubscriptionStateController(request);
}

export async function POST(request) {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/api/v1/billing/webhooks/dlocal')) {
    return dlocalBillingWebhookController(request);
  }
  if (path.endsWith('/api/v1/billing/dlocal/checkout')) {
    return dlocalCheckoutController(request);
  }
  if (path.endsWith('/api/v1/billing/dlocal/test-payment')) {
    return testDlocalPaymentController(request);
  }
  if (path.endsWith('/api/v1/billing/subscriptions/confirm')) {
    return confirmBillingSubscriptionController(request);
  }
  return createBillingSubscriptionController(request);
}
