import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Eres un analista de negocio para e-commerce por WhatsApp.
Debes responder SOLO JSON válido con estructura exacta:
{
  "hallazgo": "string",
  "alerta": "string",
  "accion": "string",
  "prioridad": "Alta|Media|Baja"
}

Reglas:
- Usa máximo 1 frase corta por campo.
- Sé accionable y concreto.
- No inventes datos.
- Si no hay suficiente data, sugiere una acción simple y prioridad baja.`;

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectMetrics(adminClient: ReturnType<typeof createClient>, businessId: string) {
  const now = new Date();
  const startToday = startOfUtcDay(now);
  const endToday = endOfUtcDay(now);
  const start7d = new Date(now);
  start7d.setUTCDate(start7d.getUTCDate() - 7);
  const start30d = new Date(now);
  start30d.setUTCDate(start30d.getUTCDate() - 30);
  const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const [
    visitsTodayRes,
    visits7dRes,
    visits30dRes,
    clicksTodayRes,
    clicks7dRes,
    clicks30dRes,
    ordersPlacedTodayRes,
    ordersPlaced7dRes,
    ordersPlacedMonthRes,
    ordersPaidTodayRes,
    ordersPaid7dRes,
    ordersPaidMonthRes,
    productsActiveRes,
    pendingOrdersRes,
    recentOrdersRes,
    topProductsRes,
  ] = await Promise.all([
    adminClient.from("wa_catalog_visits").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", startToday.toISOString()).lte("created_at", endToday.toISOString()),
    adminClient.from("wa_catalog_visits").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start7d.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_catalog_visits").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start30d.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_catalog_whatsapp_clicks").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", startToday.toISOString()).lte("created_at", endToday.toISOString()),
    adminClient.from("wa_catalog_whatsapp_clicks").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start7d.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_catalog_whatsapp_clicks").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start30d.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", startToday.toISOString()).lte("created_at", endToday.toISOString()),
    adminClient.from("wa_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start7d.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", startMonth.toISOString()).lte("created_at", now.toISOString()),
    adminClient.from("wa_orders").select("id, total_amount").eq("business_id", businessId).eq("payment_status", "pagado").not("paid_at", "is", null).gte("paid_at", startToday.toISOString()).lte("paid_at", endToday.toISOString()),
    adminClient.from("wa_orders").select("id, total_amount").eq("business_id", businessId).eq("payment_status", "pagado").not("paid_at", "is", null).gte("paid_at", start7d.toISOString()).lte("paid_at", now.toISOString()),
    adminClient.from("wa_orders").select("id, total_amount").eq("business_id", businessId).eq("payment_status", "pagado").not("paid_at", "is", null).gte("paid_at", startMonth.toISOString()).lte("paid_at", now.toISOString()),
    adminClient.from("wa_products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true),
    adminClient.from("wa_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("order_status", "pedido"),
    adminClient.from("wa_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start30d.toISOString()).lte("created_at", now.toISOString()),
    adminClient
      .from("wa_order_items")
      .select("product_name, quantity, subtotal, wa_orders!inner(business_id)")
      .eq("wa_orders.business_id", businessId),
  ]);

  /** Ingresos: filas ya filtradas por `payment_status = pagado` y `paid_at` en rango (fuente de verdad). */
  const sumRevenueRows = (rows: Array<{ total_amount?: number | string }>) =>
    (rows || []).reduce((sum, row) => sum + (Number(row?.total_amount) || 0), 0);

  const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
  (topProductsRes.data || []).forEach((item: any) => {
    const name = String(item?.product_name || "").trim() || "Producto";
    const prev = topMap.get(name) || { name, qty: 0, revenue: 0 };
    prev.qty += Number(item?.quantity) || 0;
    prev.revenue += Number(item?.subtotal) || 0;
    topMap.set(name, prev);
  });
  const bestSellers = Array.from(topMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map((p) => ({ name: p.name, qty: p.qty, revenue: p.revenue }));

  return {
    generatedAt: now.toISOString(),
    period: { timezone: "UTC", day: toIsoDate(now) },
    catalog: {
      visitsToday: visitsTodayRes.count ?? 0,
      visits7d: visits7dRes.count ?? 0,
      visits30d: visits30dRes.count ?? 0,
      clicksWhatsappToday: clicksTodayRes?.error ? 0 : (clicksTodayRes.count ?? 0),
      clicksWhatsapp7d: clicks7dRes?.error ? 0 : (clicks7dRes.count ?? 0),
      clicksWhatsapp30d: clicks30dRes?.error ? 0 : (clicks30dRes.count ?? 0),
    },
    orders: {
      ordersPending: pendingOrdersRes.count ?? 0,
      ordersRecent30d: recentOrdersRes.count ?? 0,
      ordersToday: ordersPlacedTodayRes.count ?? 0,
      orders7d: ordersPlaced7dRes.count ?? 0,
      ordersMonth: ordersPlacedMonthRes.count ?? 0,
      paidOrdersToday: ordersPaidTodayRes.data?.length ?? 0,
      paidOrders7d: ordersPaid7dRes.data?.length ?? 0,
      paidOrdersMonth: ordersPaidMonthRes.data?.length ?? 0,
    },
    revenue: {
      today: sumRevenueRows(ordersPaidTodayRes.data ?? []),
      month: sumRevenueRows(ordersPaidMonthRes.data ?? []),
    },
    products: {
      active: productsActiveRes.count ?? 0,
    },
    bestSellers,
  };
}

function hasUsefulMetrics(metrics: Record<string, any>) {
  const visits = Number(metrics?.catalog?.visits30d ?? 0);
  const clicks = Number(metrics?.catalog?.clicksWhatsapp30d ?? 0);
  const recentOrders = Number(metrics?.orders?.ordersRecent30d ?? 0);
  const revenueMonth = Number(metrics?.revenue?.month ?? 0);
  const activeProducts = Number(metrics?.products?.active ?? 0);
  const bestSellers = Array.isArray(metrics?.bestSellers) ? metrics.bestSellers.length : 0;
  return visits > 0 || clicks > 0 || recentOrders > 0 || revenueMonth > 0 || activeProducts > 0 || bestSellers > 0;
}

function isInvalidInsightText(insight: { hallazgo?: string; alerta?: string; accion?: string } | null) {
  const hay = `${insight?.hallazgo || ""} ${insight?.alerta || ""} ${insight?.accion || ""}`.toLowerCase();
  return (
    hay.includes("no se han proporcionado métricas") ||
    hay.includes("no se proporcionaron métricas") ||
    hay.includes("sin métricas")
  );
}

function normalizeInsight(insight: Record<string, unknown>) {
  const priorityRaw = String(insight?.prioridad || "").trim().toLowerCase();
  const priority = priorityRaw === "alta" ? "Alta" : priorityRaw === "media" ? "Media" : "Baja";
  return {
    hallazgo: String(insight?.hallazgo || "No se detecta un patrón claro hoy."),
    alerta: String(insight?.alerta || "Sin alertas críticas por ahora."),
    accion: String(insight?.accion || "Revisar métricas mañana y mantener seguimiento diario."),
    prioridad: priority,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = (req.headers.get("authorization") ?? "").trim();
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "User not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !openaiKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) return jsonResponse({ error: "User not authenticated" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    if (!businessId) return jsonResponse({ error: "businessId is required" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: ownBusiness, error: ownBusinessError } = await userClient
      .from("wa_businesses")
      .select("id")
      .eq("id", businessId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ownBusinessError || !ownBusiness?.id) {
      return jsonResponse({ error: "Business not found or unauthorized" }, 403);
    }

    const insightDate = toIsoDate(new Date());
    const { data: existingToday, error: existingError } = await adminClient
      .from("wa_business_daily_ai_insights")
      .select("hallazgo, alerta, accion, prioridad, generated_at, insight_date")
      .eq("business_id", businessId)
      .eq("insight_date", insightDate)
      .maybeSingle();

    const { data: lockData, error: lockError } = await adminClient
      .rpc("wa_try_daily_insight_lock", { p_business_id: businessId, p_insight_date: insightDate });
    if (lockError) {
      return jsonResponse({ error: "Failed to acquire insight lock", details: lockError.message }, 500);
    }
    const lockAcquired = !!lockData;

    if (!lockAcquired) {
      // Otra request está generando el insight del día: esperar breve y reutilizar.
      for (let i = 0; i < 5; i += 1) {
        await wait(700);
        const { data: pendingExisting } = await adminClient
          .from("wa_business_daily_ai_insights")
          .select("hallazgo, alerta, accion, prioridad, generated_at, insight_date")
          .eq("business_id", businessId)
          .eq("insight_date", insightDate)
          .maybeSingle();
        if (pendingExisting?.hallazgo && !isInvalidInsightText(pendingExisting)) {
          return jsonResponse({
            ok: true,
            cached: true,
            insight: {
              hallazgo: pendingExisting.hallazgo,
              alerta: pendingExisting.alerta,
              accion: pendingExisting.accion,
              prioridad: pendingExisting.prioridad,
              generated_at: pendingExisting.generated_at,
            },
          }, 200);
        }
      }
      return jsonResponse({ ok: false, pending: true, message: "Insight en generación, reintenta en unos segundos." }, 202);
    }

    try {
      const metrics = await collectMetrics(adminClient, businessId);
      const useful = hasUsefulMetrics(metrics);

      // Reutiliza cache diario solo si no es inválido.
      if (!existingError && existingToday?.hallazgo && !(useful && isInvalidInsightText(existingToday))) {
        return jsonResponse({
          ok: true,
          cached: true,
          insight: {
            hallazgo: existingToday.hallazgo,
            alerta: existingToday.alerta,
            accion: existingToday.accion,
            prioridad: existingToday.prioridad,
            generated_at: existingToday.generated_at,
          },
        }, 200);
      }

      // Logs temporales de trazabilidad de métricas enviadas a IA.
      console.log("[dashboard-ai-insights] metrics", {
        business_id: businessId,
        visits: metrics?.catalog?.visits30d ?? 0,
        whatsapp_clicks: metrics?.catalog?.clicksWhatsapp30d ?? 0,
        orders_pending: metrics?.orders?.ordersPending ?? 0,
        orders_recent: metrics?.orders?.ordersRecent30d ?? 0,
        monthly_revenue: metrics?.revenue?.month ?? 0,
        daily_revenue: metrics?.revenue?.today ?? 0,
        active_products: metrics?.products?.active ?? 0,
        best_sellers: metrics?.bestSellers ?? [],
      });

      if (!useful) {
        const noMetricsInsight = {
          hallazgo: "Aún no hay actividad suficiente para un patrón sólido.",
          alerta: "Sin alertas críticas por ahora.",
          accion: "Comparte tu catálogo y publica más productos para activar métricas.",
          prioridad: "Baja",
        } as const;
        const { data: savedNoMetrics } = await adminClient
          .from("wa_business_daily_ai_insights")
          .upsert({
            business_id: businessId,
            insight_date: insightDate,
            hallazgo: noMetricsInsight.hallazgo,
            alerta: noMetricsInsight.alerta,
            accion: noMetricsInsight.accion,
            prioridad: noMetricsInsight.prioridad,
            generated_at: metrics.generatedAt,
            updated_at: new Date().toISOString(),
          }, { onConflict: "business_id,insight_date" })
          .select("hallazgo, alerta, accion, prioridad, generated_at")
          .single();
        return jsonResponse({
          ok: true,
          cached: false,
          insight: {
            hallazgo: savedNoMetrics?.hallazgo ?? noMetricsInsight.hallazgo,
            alerta: savedNoMetrics?.alerta ?? noMetricsInsight.alerta,
            accion: savedNoMetrics?.accion ?? noMetricsInsight.accion,
            prioridad: savedNoMetrics?.prioridad ?? noMetricsInsight.prioridad,
            generated_at: savedNoMetrics?.generated_at ?? metrics.generatedAt,
          },
        }, 200);
      }

      const userPrompt = `Analiza estas métricas reales del dashboard y responde SOLO con JSON válido.
Métricas:
${JSON.stringify(metrics)}`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 220,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      const aiText = await aiRes.text();
      if (!aiRes.ok) {
        return jsonResponse({ error: "AI provider error", details: aiText.slice(0, 300) }, 500);
      }

      let parsedApi: any = {};
      try {
        parsedApi = aiText ? JSON.parse(aiText) : {};
      } catch {
        return jsonResponse({ error: "Invalid AI response (api json)" }, 500);
      }

      let content = parsedApi?.choices?.[0]?.message?.content?.trim() ?? "";
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) content = codeBlockMatch[1].trim();

      let insight: any = {};
      try {
        insight = content ? JSON.parse(content) : {};
      } catch {
        return jsonResponse({ error: "Invalid AI response (content json)" }, 500);
      }

      const normalized = normalizeInsight(insight);
      const { data: saved, error: saveError } = await adminClient
        .from("wa_business_daily_ai_insights")
        .upsert({
          business_id: businessId,
          insight_date: insightDate,
          hallazgo: normalized.hallazgo,
          alerta: normalized.alerta,
          accion: normalized.accion,
          prioridad: normalized.prioridad,
          generated_at: metrics.generatedAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "business_id,insight_date" })
        .select("hallazgo, alerta, accion, prioridad, generated_at")
        .single();
      if (saveError) return jsonResponse({ error: "Failed to persist insight", details: saveError.message }, 500);

      return jsonResponse({
        ok: true,
        cached: false,
        insight: {
          hallazgo: saved.hallazgo,
          alerta: saved.alerta,
          accion: saved.accion,
          prioridad: saved.prioridad,
          generated_at: saved.generated_at,
        },
      }, 200);
    } finally {
      await adminClient
        .rpc("wa_release_daily_insight_lock", { p_business_id: businessId, p_insight_date: insightDate })
        .catch(() => undefined);
    }
  } catch (err) {
    return jsonResponse({ error: "Internal server error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

