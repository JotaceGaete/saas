# Pendientes: Edge Function `dashboard-ai-insights`

Registrado el 2026-11-20 durante la reparación de `admin-users`. **No se modificó en esa reparación.**

## 1. Clave de OpenAI rechazada (HTTP 401)

- **Dónde:** `supabase/functions/dashboard-ai-insights/index.ts`, llamada a OpenAI con `Authorization: Bearer ${openaiKey}` (`openaiKey` = `OPENAI_API_KEY`).
- **Síntoma reportado:** la API de OpenAI responde 401.
- **Causa probable:** el secreto `OPENAI_API_KEY` del proyecto está vacío, revocado o no corresponde a una clave vigente.
- **Verificación pendiente:** comprobar el secreto en el panel de Supabase (Edge Functions > Secrets) sin copiar su valor en ningún lugar. Si la clave es inválida, generar una nueva en OpenAI y reemplazar el secreto. No requiere cambios de código.

## 2. `.rpc(...).catch()` sobre el builder de PostgREST

- **Dónde:** misma función, bloque `finally` (alrededor de la línea 533):

  ```ts
  await adminClient
    .rpc("wa_release_daily_insight_lock", { p_business_id: businessId, p_insight_date: insightDate })
    .catch(() => undefined);
  ```

- **Problema:** `adminClient.rpc(...)` devuelve un `PostgrestBuilder`. En `@supabase/postgrest-js` 2.118.0 (versión del repo) ese builder define `then` pero **no define `catch`**. Por eso la llamada `.catch` lanza `TypeError` antes de enviar la petición, y el lock diario no se libera.
- **Verificado:** lectura del código instalado de `@supabase/postgrest-js` (`PostgrestBuilder` expone `then`, `throwOnError`, `setHeader`, `retry`, `stripNulls`, sin `catch`). **No se reprodujo en ejecución** contra Supabase.
- **Corrección sugerida (no aplicada):** usar `const { error } = await adminClient.rpc(...)` y registrar el error, o envolver con `try { ... } catch { ... }` en el `finally`.
- **Impacto:** un lock no liberado puede bloquear la generación del insight diario hasta que expire, según la lógica de `wa_try_daily_insight_lock`. Revisar esa función antes de corregir.
