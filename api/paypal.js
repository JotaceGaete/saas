import {
  cancelPaypalSubscriptionController,
  confirmPaypalSubscriptionController,
  createPaypalSubscriptionController,
  getPaypalSubscriptionController,
} from '../backend/src/controllers/paypalSubscriptionController.js';

/**
 * Consolidado: PayPal subscriptions + cancel + confirm (Vercel Hobby: una sola Serverless Function).
 */
export async function POST(request) {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/api/v1/billing/paypal/subscriptions/cancel')) {
    return cancelPaypalSubscriptionController(request);
  }
  if (path.endsWith('/api/v1/billing/paypal/confirm')) {
    return confirmPaypalSubscriptionController(request);
  }
  return createPaypalSubscriptionController(request);
}

export async function GET(request) {
  return getPaypalSubscriptionController(request);
}
