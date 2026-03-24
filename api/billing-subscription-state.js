import {
  getBillingSubscriptionStateController,
  getCurrentSubscriptionController,
} from '../backend/src/controllers/billingSubscriptionStateController.js';

export async function GET(request) {
  const path = new URL(request.url).pathname;
  const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  if (
    normalizedPath.endsWith('/api/v1/billing/current-subscription')
    || normalizedPath.endsWith('/api/billing-current-subscription')
  ) {
    return getCurrentSubscriptionController(request);
  }
  return getBillingSubscriptionStateController(request);
}
