import { confirmBillingSubscriptionController } from '../backend/src/controllers/billingSubscriptionsController.js';

export async function POST(request) {
  return confirmBillingSubscriptionController(request);
}
