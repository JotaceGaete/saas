import { bootstrapCatalogIfNeeded } from '../backend/src/services/paypal/catalogService.js';
import { getEnv } from '../backend/src/config/env.js';

async function run() {
  try {
    getEnv();
    const result = await bootstrapCatalogIfNeeded();
    console.log(`catalogo_origen: ${result.source}`);
    console.log(`entorno: ${result.environment}`);
    console.log(`paypal_product_id: ${result.catalog.productId}`);
    console.log(`paypal_plan_id_pro: ${result.catalog.plans.pro}`);
    console.log(`paypal_plan_id_full: ${result.catalog.plans.full}`);
  } catch (err) {
    console.log('catalogo_bootstrap: error');
    console.log(`detalle: ${err?.message || 'unknown'}`);
    process.exitCode = 1;
  }
}

run();

