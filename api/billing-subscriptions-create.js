import { createBillingSubscriptionController } from '../backend/src/controllers/billingSubscriptionsController.js';
import { testDlocalPaymentController } from '../backend/src/controllers/dlocalTestPaymentController.js';

export async function POST(request) {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/api/v1/billing/dlocal/test-payment')) {
    return testDlocalPaymentController(request);
  }
  return createBillingSubscriptionController(request);
}

export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    route: 'billing-subscriptions-create',
    message: 'Use POST for create or dlocal test-payment rewrite.',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
