import { dlocalCallbackController } from '../backend/src/controllers/dlocalCallbackController.js';

export async function POST(request) {
  return dlocalCallbackController(request);
}
