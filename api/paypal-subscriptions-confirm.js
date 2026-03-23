import { confirmPaypalSubscriptionController } from '../backend/src/controllers/paypalSubscriptionController.js';

export async function POST(request) {
  return confirmPaypalSubscriptionController(request);
}
