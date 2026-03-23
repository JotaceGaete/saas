import {
  getPaypalPlanIdForInternalPlan,
  getInternalPlanFromPaypalPlanId,
  normalizePlanSlugForBilling,
} from '../src/services/billing/planMappingService.js';
import { getPaypalMode } from '../src/config/paypal/index.js';
import { getEnv } from '../src/config/env.js';

async function run() {
  try {
    getEnv();
    const freePlanId = await getPaypalPlanIdForInternalPlan('free');
    const proPlanId = await getPaypalPlanIdForInternalPlan('pro');
    const fullPlanId = await getPaypalPlanIdForInternalPlan('full');

    const fromPro = await getInternalPlanFromPaypalPlanId(proPlanId);
    const fromFull = await getInternalPlanFromPaypalPlanId(fullPlanId);

    console.log(`modo_actual: ${getPaypalMode()}`);
    console.log(`free_paypal_plan_id: ${freePlanId === null ? 'null' : 'unexpected'}`);
    console.log(`pro_paypal_plan_id_presente: ${proPlanId ? 'si' : 'no'}`);
    console.log(`full_paypal_plan_id_presente: ${fullPlanId ? 'si' : 'no'}`);
    console.log(`reverse_pro: ${fromPro || 'null'}`);
    console.log(`reverse_full: ${fromFull || 'null'}`);
    console.log(`normalize_business: ${normalizePlanSlugForBilling('business') || 'null'}`);
  } catch (err) {
    console.log('plan_mapping_ok: no');
    console.log(`detalle: ${err?.message || 'unknown'}`);
    process.exitCode = 1;
  }
}

run();

