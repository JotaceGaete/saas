// One-shot operator runner for the single manual DTE 39 emission.
// NOT executed by this change. Requires, in addition to the in-code gates:
//   - the operator's explicit confirmation token on the command line
//   - service-role credentials from the server environment (never printed)
// Usage (operator only, after written authorization):
//   node scripts/fiscal/run-single-live-emission.mjs <businessId> <saleId> <authorizationId> 100 --confirm EMITIR-UNA-BOLETA-<saleId>
import { createClient } from '@supabase/supabase-js';
import { createLiveSingleEmission } from '../../api/_lib/siisolutions-live-single-emission.js';

const [businessId, saleId, authorizationId, amountRaw, flag, token] = process.argv.slice(2);
const amount = Number(amountRaw);

if (flag !== '--confirm' || token !== `EMITIR-UNA-BOLETA-${saleId}`) {
  console.error('Refusing: explicit confirmation token required (--confirm EMITIR-UNA-BOLETA-<saleId>).');
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error('Refusing: server credentials not present in the environment.');
  process.exit(2);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// Sequential only: refuse if any earlier attempt for this business is still
// unresolved (sending/unknown). Unknown outcomes are never repeated.
const { data: open, error: openErr } = await admin.from('crm_fiscal_issuances')
  .select('id,sale_id,status').eq('business_id', businessId).in('status', ['sending', 'unknown']);
if (openErr || (open && open.length > 0)) {
  console.error('Refusing: unresolved fiscal operation exists for this business. Reconcile first.');
  process.exit(3);
}

// Mark the sale as a technical test BEFORE emitting, so a crash cannot leave
// an unmarked test document. Idempotent; never updates or deletes.
const { error: markErr } = await admin.from('fiscal_test_sales')
  .upsert({ business_id: businessId, sale_id: saleId, reason: 'PRUEBA_TECNICA_SII' },
    { onConflict: 'sale_id', ignoreDuplicates: true });
if (markErr) {
  console.error('Refusing: could not record the test-sale marker.');
  process.exit(3);
}

const result = await createLiveSingleEmission({ admin })({
  businessId, saleId, authorizationId, amount,
});
// Read back the ledger row and report the monetary fields the XML states.
// Prints no keys and no document bytes.
let xmlTotals = null;
const { data: row } = await admin.from('crm_fiscal_issuances')
  .select('status,folio,xml_base64,operation_id').eq('business_id', businessId).eq('sale_id', saleId).maybeSingle();
if (row?.xml_base64) {
  const xml = Buffer.from(row.xml_base64, 'base64').toString('latin1');
  const tag = n => (xml.match(new RegExp(`<${n}>([^<]*)</${n}>`)) || [])[1] ?? null;
  xmlTotals = { TipoDTE: tag('TipoDTE'), Folio: tag('Folio'), MntNeto: tag('MntNeto'), IVA: tag('IVA'), MntTotal: tag('MntTotal') };
}
console.log(JSON.stringify({
  state: result.state, folio: result.folio ?? null,
  operationId: result.operationId ?? null, reason: result.reason ?? null,
  ledgerStatus: row?.status ?? null, xmlTotals,
}, null, 2));
process.exit(result.state === 'issued' ? 0 : 1);
