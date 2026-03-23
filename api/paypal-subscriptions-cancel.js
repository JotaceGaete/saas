import { cancelPaypalSubscriptionController } from './src/controllers/paypalSubscriptionController.js';

export async function POST(request) {
  return cancelPaypalSubscriptionController(request);
}

