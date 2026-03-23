import { isHttpError } from '../lib/http/HttpError.js';
import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { runDlocalTestPayment } from '../services/providers/dlocal/testPaymentService.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function testDlocalPaymentController(request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const result = await runDlocalTestPayment({
      amount: body?.amount,
      currency: body?.currency,
      country: body?.country,
      endpointPath: body?.endpointPath,
      orderId: body?.orderId,
      email: body?.email || authUser?.email,
      paymentMethodFlow: body?.paymentMethodFlow,
    });
    return json({
      ok: true,
      message: 'dLocal sandbox test payment request executed',
      ...result,
    }, 200);
  } catch (err) {
    if (isHttpError(err)) {
      return json({
        ok: false,
        code: err?.code || null,
        provider: err?.provider || null,
        error: err.message,
        details: err?.details || null,
      }, err.statusCode);
    }
    return json({
      ok: false,
      code: 'DLOCAL_TEST_UNEXPECTED_ERROR',
      error: err?.message || 'dlocal_test_payment_failed',
    }, 500);
  }
}
