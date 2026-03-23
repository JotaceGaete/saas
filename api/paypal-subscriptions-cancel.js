import { cancelPaypalSubscriptionController } from '../backend/src/controllers/paypalSubscriptionController.js';

export async function POST(request) {
  return cancelPaypalSubscriptionController(request);
}
