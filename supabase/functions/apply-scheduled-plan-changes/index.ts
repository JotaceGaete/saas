// Aplica downgrades programados donde plan_expires_at <= now().
// Puede ser llamada por cron o al cargar la app/planes. Requiere JWT (opcional: service key para cron).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Authorization required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: rows, error } = await adminClient.rpc('wa_apply_scheduled_plan_changes');

  if (error) {
    console.error('[apply-scheduled-plan-changes] RPC error:', error.message);
    return jsonResponse({ error: 'Failed to apply scheduled changes', detail: error.message }, 500);
  }

  const applied = Array.isArray(rows) ? rows : [];
  console.log('[apply-scheduled-plan-changes] applied', applied.length, applied);
  return jsonResponse({ applied: applied.length, changes: applied }, 200);
});
