import { testDlocalPaymentController } from '../backend/src/controllers/dlocalTestPaymentController.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  return json({
    ok: true,
    route: 'dlocal-test-payment',
    methods: ['GET', 'POST'],
  });
}

export async function POST(request) {
  return testDlocalPaymentController(request);
}
