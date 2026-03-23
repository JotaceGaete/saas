import { handlePaypalEvent } from '../src/services/subscriptions/paypalEventHandlers.js';

async function run() {
  try {
    const createLikeEvent = {
      event_type: 'BILLING.SUBSCRIPTION.CREATED',
      resource: {
        id: 'I-DIAGNOSTIC123',
        status: 'APPROVAL_PENDING',
        custom_id: 'business:biz_diag_123',
      },
    };

    const activatedEvent = {
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: {
        id: 'I-DIAGNOSTIC123',
        status: 'ACTIVE',
      },
    };

    const saleCompletedEvent = {
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: {
        billing_agreement_id: 'I-DIAGNOSTIC123',
      },
    };

    const r1 = await handlePaypalEvent(createLikeEvent);
    const r2 = await handlePaypalEvent(activatedEvent);
    const r3 = await handlePaypalEvent(saleCompletedEvent);

    console.log('event_handler_diagnostic_ok: si');
    console.log(`created_event_handled: ${r1?.handled ? 'yes' : 'no'}`);
    console.log(`activated_event_handled: ${r2?.handled ? 'yes' : 'no'}`);
    console.log(`sale_event_handled: ${r3?.handled ? 'yes' : 'no'}`);
  } catch (err) {
    console.log('event_handler_diagnostic_ok: no');
    console.log(`detalle: ${err?.message || 'unknown'}`);
    process.exitCode = 1;
  }
}

run();

