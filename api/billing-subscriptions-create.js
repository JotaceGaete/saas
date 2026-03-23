import { createBillingSubscriptionController } from '../backend/src/controllers/billingSubscriptionsController.js';

export async function POST(request) {
  return createBillingSubscriptionController(request);
}
