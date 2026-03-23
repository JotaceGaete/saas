#!/usr/bin/env node
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYPAL_PRODUCT_NAME = process.env.PAYPAL_PRODUCT_NAME || 'Ventalink';
const PAYPAL_PRODUCT_DESCRIPTION =
  process.env.PAYPAL_PRODUCT_DESCRIPTION || 'Suscripciones Ventalink';
const PAYPAL_PRODUCT_TYPE = process.env.PAYPAL_PRODUCT_TYPE || 'SERVICE';
const PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY || 'USD';

const PAYPAL_PLAN_PRO_PRICE = Number(process.env.PAYPAL_PLAN_PRO_PRICE || 5);
const PAYPAL_PLAN_FULL_PRICE = Number(process.env.PAYPAL_PLAN_FULL_PRICE || 10);

const PAYPAL_PLAN_MAPPING_TABLE =
  process.env.PAYPAL_PLAN_MAPPING_TABLE || 'paypal_plan_mappings';

function getPaypalBaseUrl() {
  return PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`No se pudo autenticar con PayPal: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${getPaypalBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`PayPal ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function findExistingProductByName() {
  const data = await paypalRequest('/v1/catalogs/products?page_size=100&page=1&total_required=true');
  const products = data.products || [];
  return products.find((p) => p.name === PAYPAL_PRODUCT_NAME) || null;
}

async function createProduct() {
  return paypalRequest('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: PAYPAL_PRODUCT_NAME,
      description: PAYPAL_PRODUCT_DESCRIPTION,
      type: PAYPAL_PRODUCT_TYPE,
      category: 'SOFTWARE',
      image_url: 'https://ventalink.app',
      home_url: 'https://ventalink.app',
    }),
  });
}

function buildPlanPayload({ productId, name, description, amount }) {
  return {
    product_id: productId,
    name,
    description,
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1,
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: amount.toFixed(2),
            currency_code: PAYPAL_CURRENCY,
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
    taxes: {
      percentage: '0',
      inclusive: false,
    },
  };
}

async function createPlan(planPayload) {
  return paypalRequest('/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify(planPayload),
  });
}

async function getMapping(supabase, planSlug) {
  const { data, error } = await supabase
    .from(PAYPAL_PLAN_MAPPING_TABLE)
    .select('*')
    .eq('environment', PAYPAL_MODE)
    .eq('plan_slug', planSlug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertMapping(supabase, row) {
  const { data, error } = await supabase
    .from(PAYPAL_PLAN_MAPPING_TABLE)
    .upsert(row, {
      onConflict: 'environment,plan_slug',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function ensureProduct(supabase) {
  const existingPro = await getMapping(supabase, 'pro');
  const existingFull = await getMapping(supabase, 'full');

  const mappedProductId = existingPro?.paypal_product_id || existingFull?.paypal_product_id;
  if (mappedProductId) {
    return { id: mappedProductId, source: 'repository' };
  }

  const existingPaypalProduct = await findExistingProductByName();
  if (existingPaypalProduct) {
    return { id: existingPaypalProduct.id, source: 'paypal' };
  }

  const created = await createProduct();
  return { id: created.id, source: 'paypal_created' };
}

async function ensurePaidPlan(supabase, { slug, amount, productId }) {
  const existing = await getMapping(supabase, slug);
  if (existing?.paypal_plan_id) {
    return {
      slug,
      paypal_plan_id: existing.paypal_plan_id,
      paypal_product_id: existing.paypal_product_id,
      catalog_source: 'repository',
      created: false,
    };
  }

  const createdPlan = await createPlan(
    buildPlanPayload({
      productId,
      name: `${PAYPAL_PRODUCT_NAME} ${slug.toUpperCase()}`,
      description: `Plan ${slug} mensual`,
      amount,
    })
  );

  const saved = await upsertMapping(supabase, {
    environment: PAYPAL_MODE,
    plan_slug: slug,
    paypal_product_id: productId,
    paypal_plan_id: createdPlan.id,
    currency: PAYPAL_CURRENCY,
    amount,
    interval_unit: 'MONTH',
    interval_count: 1,
    active: true,
    metadata: {
      plan_name: `${PAYPAL_PRODUCT_NAME} ${slug.toUpperCase()}`,
      paypal_mode: PAYPAL_MODE,
    },
  });

  return {
    slug,
    paypal_plan_id: saved.paypal_plan_id,
    paypal_product_id: saved.paypal_product_id,
    catalog_source: 'paypal',
    created: true,
  };
}

async function ensureFreePlan(supabase) {
  const saved = await upsertMapping(supabase, {
    environment: PAYPAL_MODE,
    plan_slug: 'free',
    paypal_product_id: null,
    paypal_plan_id: null,
    currency: PAYPAL_CURRENCY,
    amount: 0,
    interval_unit: 'MONTH',
    interval_count: 1,
    active: true,
    metadata: {
      local_only: true,
      note: 'Plan gratuito, no existe en PayPal',
    },
  });

  return saved;
}

async function main() {
  const supabase = getSupabase();

  const product = await ensureProduct(supabase);

  const free = await ensureFreePlan(supabase);
  const pro = await ensurePaidPlan(supabase, {
    slug: 'pro',
    amount: PAYPAL_PLAN_PRO_PRICE,
    productId: product.id,
  });

  const full = await ensurePaidPlan(supabase, {
    slug: 'full',
    amount: PAYPAL_PLAN_FULL_PRICE,
    productId: product.id,
  });

  console.log(JSON.stringify({
    ok: true,
    mode: PAYPAL_MODE,
    catalogo_origen: product.source === 'repository' ? 'repository' : 'paypal',
    productId: product.id,
    plans: {
      free: {
        planSlug: free.plan_slug,
        paypalPlanId: free.paypal_plan_id,
      },
      pro,
      full,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error('Fallo en paypal-catalog-bootstrap.js');
  console.error(err);
  process.exit(1);
});