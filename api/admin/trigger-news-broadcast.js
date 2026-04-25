import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CHUNK_SIZE = 100

function log(level, data) {
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ level, ts: new Date().toISOString(), endpoint: 'trigger-news-broadcast', ...data })
  )
}

function isValidEmail(email) {
  return typeof email === 'string' && email.includes('@') && email.length > 3
}

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  // Auth: x-admin-secret
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  // Verificar que el template "news" está habilitado (si EMAIL_ENABLED_TEMPLATES existe)
  const enabledRaw = process.env.EMAIL_ENABLED_TEMPLATES
  if (enabledRaw) {
    const enabledList = enabledRaw.split(',').map(t => t.trim())
    if (!enabledList.includes('news')) {
      return res.status(403).json({
        ok: false,
        error: 'Template "news" no está en EMAIL_ENABLED_TEMPLATES',
        enabled: enabledList,
      })
    }
  }

  const { broadcast_id, subject, headline, body, cta_label, cta_url } = req.body || {}

  if (!broadcast_id || typeof broadcast_id !== 'string' || broadcast_id.trim() === '') {
    return res.status(400).json({ ok: false, error: 'broadcast_id requerido (string no vacío)' })
  }

  const broadcastId = broadcast_id.trim()

  // ── Dedup: verificar si este broadcast_id ya fue ejecutado ───────────────
  const { data: existingRun, error: runCheckError } = await supabase
    .from('email_broadcast_runs')
    .select('id, total_enqueued, skipped, created_at')
    .eq('broadcast_id', broadcastId)
    .maybeSingle()

  if (runCheckError) {
    log('error', { error_code: 'RUN_CHECK_FAILED', error_message: runCheckError.message })
    return res.status(500).json({ ok: false, error: 'Error verificando broadcast_id' })
  }

  if (existingRun) {
    return res.status(409).json({
      ok: false,
      error: 'broadcast_id ya fue ejecutado. Usa un nuevo broadcast_id para un nuevo envío.',
      run: existingRun,
    })
  }

  // ── Obtener negocios activos con email ───────────────────────────────────
  const { data: businesses, error: bizError } = await supabase
    .from('wa_businesses')
    .select('id, user_id, name, email')
    .eq('is_active', true)

  if (bizError) {
    log('error', { error_code: 'FETCH_BUSINESSES_FAILED', error_message: bizError.message })
    return res.status(500).json({ ok: false, error: 'Error obteniendo negocios' })
  }

  const withValidEmail = (businesses || []).filter(b => isValidEmail(b.email))

  if (withValidEmail.length === 0) {
    log('info', { broadcast_id: broadcastId, message: 'Sin negocios con email válido' })
    return res.json({ ok: true, broadcast_id: broadcastId, enqueued: 0, skipped: 0 })
  }

  // ── Excluir negocios con un "news" ya en pending o failed ────────────────
  // (para no pisar emails que aún no fueron procesados del ciclo anterior)
  const { data: blocked, error: blockedError } = await supabase
    .from('email_queue')
    .select('business_id')
    .eq('template', 'news')
    .in('status', ['pending', 'failed'])

  if (blockedError) {
    log('error', { error_code: 'FETCH_BLOCKED_FAILED', error_message: blockedError.message })
    return res.status(500).json({ ok: false, error: 'Error verificando cola existente' })
  }

  const blockedIds = new Set((blocked || []).map(r => r.business_id))
  const toEnqueue = withValidEmail.filter(b => !blockedIds.has(b.id))
  const skippedCount = withValidEmail.length - toEnqueue.length

  log('info', {
    broadcast_id: broadcastId,
    total_businesses: withValidEmail.length,
    to_enqueue: toEnqueue.length,
    skipped_blocked: skippedCount,
  })

  // ── Insertar en email_queue por chunks ───────────────────────────────────
  const now = new Date().toISOString()
  const payload = {
    broadcast_id: broadcastId,
    ...(subject   && { subject }),
    ...(headline  && { headline }),
    ...(body      && { body }),
    ...(cta_label && { cta_label }),
    ...(cta_url   && { cta_url }),
  }

  let enqueued = 0

  for (let i = 0; i < toEnqueue.length; i += CHUNK_SIZE) {
    const chunk = toEnqueue.slice(i, i + CHUNK_SIZE).map(b => ({
      user_id:         b.user_id,
      business_id:     b.id,
      type:            'news',
      template:        'news',
      to_email:        b.email,
      subject:         subject || null,
      payload:         {
        ...payload,
        business_name: b.name || null,
        user_email:    b.email,
      },
      next_attempt_at: now,
      status:          'pending',
      retry_count:     0,
    }))

    const { error: insertError, count } = await supabase
      .from('email_queue')
      .insert(chunk, { count: 'exact' })

    if (insertError) {
      log('error', {
        broadcast_id: broadcastId,
        error_code: 'INSERT_CHUNK_FAILED',
        chunk_start: i,
        error_message: insertError.message,
      })
      // Registrar el run parcial antes de retornar el error
      await supabase.from('email_broadcast_runs').insert({
        broadcast_id: broadcastId,
        template:     'news',
        subject:      subject || null,
        total_enqueued: enqueued,
        skipped:      skippedCount,
      }).throwOnError()

      return res.status(500).json({
        ok: false,
        error: 'Error insertando chunk en email_queue',
        enqueued_before_error: enqueued,
      })
    }

    enqueued += count ?? chunk.length
  }

  // ── Registrar el broadcast run ───────────────────────────────────────────
  const { error: runInsertError } = await supabase
    .from('email_broadcast_runs')
    .insert({
      broadcast_id:   broadcastId,
      template:       'news',
      subject:        subject || null,
      total_enqueued: enqueued,
      skipped:        skippedCount,
    })

  if (runInsertError) {
    // Emails ya están en cola. Loggear pero no fallar al cliente.
    log('error', {
      broadcast_id: broadcastId,
      error_code: 'RUN_RECORD_FAILED',
      error_message: runInsertError.message,
    })
  }

  log('info', {
    broadcast_id: broadcastId,
    status: 'done',
    enqueued,
    skipped: skippedCount,
  })

  return res.json({
    ok: true,
    broadcast_id: broadcastId,
    enqueued,
    skipped: skippedCount,
  })
}
