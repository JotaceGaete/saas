import {
  createPaypalSubscriptionController,
  getPaypalSubscriptionController,
} from '../backend/src/controllers/paypalSubscriptionController.js';

export async function POST(request) {
  return createPaypalSubscriptionController(request);
}

export async function GET(request) {
  return getPaypalSubscriptionController(request);
}
