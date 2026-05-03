import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAX_RETRIES = 3
const DEFAULT_BATCH_SIZE = 5
const MAX_BATCH_SIZE = 20
const RETRY_DELAY_MINUTES = [15, 30, 60]

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID no configurados')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  const body = await response.json()
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram API error: ${body.description || response.status}`)
  }

  return body
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatAlertMessage(alert) {
  const p = alert.payload || {}

  switch (alert.type) {
    case 'new_user':
      return [
        'Nuevo usuario registrado',
        '',
        `<b>Email:</b> ${escHtml(p.user_email)}`,
        `<b>Negocio:</b> ${escHtml(p.business_name)}`,
        `<b>ID:</b> <code>${escHtml(p.business_id)}</code>`,
        `<b>Fecha:</b> ${escHtml(p.created_at)}`,
      ].join('\n')

    default:
      return [
        `<b>Alerta admin: ${escHtml(alert.type)}</b>`,
        '',
        `<pre>${escHtml(JSON.stringify(p, null, 2))}</pre>`,
      ].join('\n')
  }
}

function getBatchSize() {
  const raw = Number.parseInt(process.env.ADMIN_ALERT_QUEUE_BATCH_SIZE || '', 10)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_SIZE
  return Math.min(raw, MAX_BATCH_SIZE)
}

function getCronSecret() {
  return process.env.CRON_SECRET || process.env.EMAIL_CRON_SECRET || null
}

function getRetryDelayMinutes(nextRetry) {
  return RETRY_DELAY_MINUTES[Math.max(0, nextRetry - 1)] || RETRY_DELAY_MINUTES[RETRY_DELAY_MINUTES.length - 1]
}

function log(level, data) {
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ level, ts: new Date().toISOString(), ...data })
  )
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const cronSecret = getCronSecret()
    if (!cronSecret || req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const batchSize = getBatchSize()
    const { data: alerts, error } = await supabase
      .from('admin_alert_queue')
      .select('id, type, payload, retry_count')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (error) throw error

    let sent = 0
    let failed = 0

    for (const alert of alerts || []) {
      try {
        const message = formatAlertMessage(alert)
        await sendTelegram(message)

        await supabase
          .from('admin_alert_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error: null,
            next_attempt_at: null,
          })
          .eq('id', alert.id)

        sent++
      } catch (err) {
        const nextRetry = alert.retry_count + 1
        const exhausted = nextRetry >= MAX_RETRIES
        const nextAttemptAt = exhausted
          ? null
          : new Date(Date.now() + getRetryDelayMinutes(nextRetry) * 60 * 1000).toISOString()

        await supabase
          .from('admin_alert_queue')
          .update({
            status: 'failed',
            retry_count: nextRetry,
            error: err.message,
            next_attempt_at: nextAttemptAt,
          })
          .eq('id', alert.id)

        log('error', {
          queue_id: alert.id,
          type: alert.type,
          retry_count: nextRetry,
          exhausted,
          error_message: err.message?.slice(0, 200),
        })

        failed++
      }
    }

    log('info', {
      status: 'completed',
      batch_size: batchSize,
      fetched: alerts?.length || 0,
      sent,
      failed,
    })

    return res.json({
      ok: true,
      processed: (alerts || []).length,
      batchSize,
      sent,
      failed,
    })
  } catch (err) {
    log('error', {
      error_code: 'HANDLER_ERROR',
      error_message: err.message?.slice(0, 200),
    })
    return res.status(500).json({ ok: false, error: err.message })
  }
}
