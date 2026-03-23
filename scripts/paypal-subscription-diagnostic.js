import { getEnv } from '../backend/src/config/env.js';
import {
  createSubscription,
  getSubscription,
  cancelSubscription,
  getLocalSubscriptionRecord,
} from '../backend/src/services/paypal/subscriptionService.js';

function parseArgs(argv) {
  const map = new Map();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const idx = arg.indexOf('=');
    if (idx < 0) {
      map.set(arg.slice(2), 'true');
    } else {
      map.set(arg.slice(2, idx), arg.slice(idx + 1));
    }
  }
  return map;
}

async function run() {
  try {
    const env = getEnv();
    const args = parseArgs(process.argv.slice(2));

    const plan = String(args.get('plan') || 'pro').toLowerCase();
    const userId = String(args.get('userId') || '').trim();
    const businessId = String(args.get('businessId') || '').trim();
    const email = String(args.get('email') || '').trim();
    const shouldCancel = String(args.get('cancel') || 'false').toLowerCase() === 'true';

    const returnUrl = String(args.get('returnUrl') || 'https://go.ventalink.app/billing/paypal/return');
    const cancelUrl = String(args.get('cancelUrl') || 'https://go.ventalink.app/billing/paypal/cancel');

    console.log('[subscription-diagnostic]');
    console.log(`mode: ${env.paypal.mode}`);
    console.log(`plan: ${plan}`);
    console.log(`has_user_id: ${userId ? 'yes' : 'no'}`);
    console.log(`has_business_id: ${businessId ? 'yes' : 'no'}`);
    console.log(`will_cancel_after_create: ${shouldCancel ? 'yes' : 'no'}`);
    console.log('');

    const created = await createSubscription({
      internalPlanSlug: plan,
      userId,
      businessId,
      subscriberEmail: email,
      returnUrl,
      cancelUrl,
    });

    console.log(`create_ok: si`);
    console.log(`subscription_id: ${created.id}`);
    console.log(`subscription_status: ${created.status || 'unknown'}`);
    console.log(`approve_url_present: ${created.approveUrl ? 'yes' : 'no'}`);
    console.log(`custom_id: ${created.customId}`);

    const current = await getSubscription(created.id);
    console.log(`get_ok: si`);
    console.log(`get_status: ${current?.status || 'unknown'}`);

    const localAfterGet = await getLocalSubscriptionRecord(created.id);
    console.log(`local_record_present: ${localAfterGet ? 'yes' : 'no'}`);
    console.log(`local_status: ${localAfterGet?.status || 'unknown'}`);

    if (shouldCancel) {
      await cancelSubscription({ subscriptionId: created.id, reason: 'Diagnostic script cancellation' });
      console.log('cancel_ok: si');
      const localAfterCancel = await getLocalSubscriptionRecord(created.id);
      console.log(`local_status_after_cancel: ${localAfterCancel?.status || 'unknown'}`);
    } else {
      console.log('cancel_ok: skipped');
    }
  } catch (err) {
    console.log('subscription_diagnostic_ok: no');
    console.log(`detalle: ${err?.message || 'unknown'}`);
    process.exitCode = 1;
  }
}

run();

