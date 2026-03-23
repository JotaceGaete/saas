#!/usr/bin/env node
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYPAL_PLAN_MAPPING_TABLE =
  process.env.PAYPAL_PLAN_MAPPING_TABLE || 'paypal_plan_mappings';

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from(PAYPAL_PLAN_MAPPING_TABLE)
    .select('*')
    .eq('environment', PAYPAL_MODE)
    .order('plan_slug', { ascending: true });

  if (error) {
    console.error('Error leyendo mappings');
    console.error(error);
    process.exit(1);
  }

  const bySlug = Object.fromEntries((data || []).map((row) => [row.plan_slug, row]));

  const output = {
    mode: PAYPAL_MODE,
    free: bySlug.free
      ? {
          paypal_plan_id: bySlug.free.paypal_plan_id,
          amount: bySlug.free.amount,
          currency: bySlug.free.currency,
          ok: bySlug.free.paypal_plan_id === null,
        }
      : null,
    pro: bySlug.pro
      ? {
          paypal_plan_id: bySlug.pro.paypal_plan_id,
          paypal_product_id: bySlug.pro.paypal_product_id,
          amount: bySlug.pro.amount,
          currency: bySlug.pro.currency,
          ok: Boolean(bySlug.pro.paypal_plan_id),
        }
      : null,
    full: bySlug.full
      ? {
          paypal_plan_id: bySlug.full.paypal_plan_id,
          paypal_product_id: bySlug.full.paypal_product_id,
          amount: bySlug.full.amount,
          currency: bySlug.full.currency,
          ok: Boolean(bySlug.full.paypal_plan_id),
        }
      : null,
  };

  console.log(JSON.stringify(output, null, 2));

  const success =
    output.free?.ok === true &&
    output.pro?.ok === true &&
    output.full?.ok === true;

  if (!success) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Fallo en paypal-plan-mapping-diagnostic.js');
  console.error(err);
  process.exit(1);
});