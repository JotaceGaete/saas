import { testDlocalPaymentController } from '../backend/src/controllers/dlocalTestPaymentController.js';

export async function POST(request) {
  return testDlocalPaymentController(request);
}
