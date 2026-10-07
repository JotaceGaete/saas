// mp-point-reconcile — reconciliación server-side de operaciones Point abandonadas.
// Invocada por pg_cron con un secreto dedicado. Mercado Pago siempre es la
// fuente de verdad; el estado almacenado localmente nunca autoriza por sí solo
// una venta ni una liberación de stock.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { MP_ALLOWED_STATUSES, MP_ORDERS_URL, sanitizePointOrder } from '../_shared/mpPoint.ts';

const BATCH_SIZE = 10;
const STALE_MINUTES = 5;
const TERMINAL_RELEASE_STATUSES = new Set(['failed', 'expired', 'canceled', 'refunded']);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expectedSecret = Deno.env.get('POINT_RECONCILE_SECRET') ?? '';
  const incomingSecret = req.headers.get('x-point-reconcile-secret') ?? '';
  if (!expectedSecret || !safeEqual(incomingSecret, expectedSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const adminKey = getSupabaseAdminKeyOrEmpty();
  if (!supabaseUrl || !adminKey) return json({ error: 'Server configuration error' }, 500);
  const admin = createClient(supabaseUrl, adminKey);

  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const operationSelect = 'id,business_id,mp_order_id,external_reference,mp_status,crm_invoice_id,processed_at';

  // Camino normal: operaciones activas que dejaron de recibir polling/webhook.
  const { data: activeOperations, error: activeError } = await admin
    .from('crm_pos_point_operations')
    .select(operationSelect)
    .is('crm_invoice_id', null)
    .not('mp_order_id', 'is', null)
    .in('mp_status', ['created', 'at_terminal', 'action_required', 'processed'])
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (activeError) return json({ error: 'Operation lookup failed' }, 500);

  // Camino de reparación: si una operación ya quedó terminal pero una
  // liberación anterior falló, la reserva sigue siendo la prueba durable de
  // que falta cleanup. El INNER JOIN evita recorrer terminales históricos
  // que ya no tienen nada pendiente y evita starvation por reservas activas.
  const { data: terminalCleanupOperations, error: cleanupError } = await admin
    .from('crm_pos_point_operations')
    .select(`${operationSelect},crm_pos_point_stock_reservations!inner(operation_id)`)
    .is('crm_invoice_id', null)
    .not('mp_order_id', 'is', null)
    .in('mp_status', ['failed', 'expired', 'canceled', 'refunded'])
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (cleanupError) return json({ error: 'Cleanup lookup failed' }, 500);

  const deduped = new Map<string, (NonNullable<typeof activeOperations>)[number]>();
  for (const op of [...(activeOperations ?? []), ...(terminalCleanupOperations ?? [])]) deduped.set(op.id, op);
  const operations = [...deduped.values()].slice(0, BATCH_SIZE);

  const result = { examined: 0, synced: 0, finalized: 0, released: 0, deferred: 0, failed: 0 };

  for (const op of operations ?? []) {
    result.examined++;
    try {
      const { data: rows, error: connError } = await admin.rpc('wa_get_mp_point_connection', {
        p_business_id: op.business_id,
      });
      const connection = Array.isArray(rows) ? rows[0] : null;
      if (connError || !connection?.access_token) {
        result.deferred++;
        console.warn('[mp-point-reconcile] connection unavailable', { operationId: op.id, businessId: op.business_id });
        continue;
      }
      if (connection.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now()) {
        result.deferred++;
        console.warn('[mp-point-reconcile] connection expired', { operationId: op.id, businessId: op.business_id });
        continue;
      }

      let mpResponse: Response;
      try {
        mpResponse = await fetch(`${MP_ORDERS_URL}/${encodeURIComponent(op.mp_order_id)}`, {
          headers: { Authorization: `Bearer ${connection.access_token}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        result.deferred++;
        continue;
      }

      if (!mpResponse.ok) {
        result.deferred++;
        console.warn('[mp-point-reconcile] Mercado Pago GET failed', { operationId: op.id, status: mpResponse.status });
        continue;
      }

      const order = sanitizePointOrder(await mpResponse.json());
      if (
        order.id !== op.mp_order_id ||
        order.external_reference !== op.external_reference ||
        !order.status ||
        !MP_ALLOWED_STATUSES.has(order.status)
      ) {
        result.failed++;
        console.error('[mp-point-reconcile] correlation/status mismatch', { operationId: op.id });
        continue;
      }

      const update: Record<string, unknown> = {
        mp_status: order.status,
        mp_status_detail: order.status_detail,
        mp_payment_id: order.payment_id,
        updated_at: new Date().toISOString(),
      };
      if (order.status === 'processed' && !op.processed_at) update.processed_at = new Date().toISOString();

      const { error: syncError } = await admin.from('crm_pos_point_operations').update(update).eq('id', op.id);
      if (syncError) {
        result.failed++;
        continue;
      }
      result.synced++;

      if (order.status === 'processed') {
        const { data: finalized, error: finalizeError } = await admin.rpc('crm_finalize_point_sale', {
          p_operation_id: op.id,
        });
        if (finalizeError) {
          result.deferred++;
          console.error('[mp-point-reconcile] finalization deferred', { operationId: op.id, error: finalizeError.message });
          continue;
        }
        result.finalized++;
        console.log('[mp-point-reconcile] finalized', { operationId: op.id, invoice: finalized ?? null });
      } else if (TERMINAL_RELEASE_STATUSES.has(order.status)) {
        const { error: releaseError } = await admin.rpc('crm_point_release_stock', { p_operation_id: op.id });
        if (releaseError) {
          result.deferred++;
          console.error('[mp-point-reconcile] release deferred', { operationId: op.id, error: releaseError.message });
          continue;
        }
        result.released++;
      }
    } catch (error) {
      result.failed++;
      console.error('[mp-point-reconcile] unexpected operation failure', {
        operationId: op.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(result);
});
