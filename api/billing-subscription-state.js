import { getBillingSubscriptionStateController } from '../backend/src/controllers/billingSubscriptionStateController.js';

export async function GET(request) {
  return getBillingSubscriptionStateController(request);
}
