import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAX_RETRIES = 3
const BATCH_SIZE = 10

/**
 * Envía un mensaje a Telegram vía Bot API.
 * Usa parse_mode MarkdownV2 — los caracteres especiales en los valores
 * deben escaparse antes de llamar a esta función (ver escapeMarkdown).
 */
async function sendTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID no configurados')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    chatId,
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

/** Escapa caracteres que Telegram HTML no acepta dentro de texto libre. */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Formatea el texto del mensaje según el tipo de alerta.
 * Añadir nuevos tipos aquí a medida que se necesiten.
 */
function formatAlertMessage(alert) {
  const p = alert.payload || {}

  switch (alert.type) {
    case 'new_user':
      return [
        '🆕 <b>Nuevo usuario registrado</b>',
        '',
        `👤 <b>Email:</b> ${escHtml(p.user_email)}`,
        `🏪 <b>Negocio:</b> ${escHtml(p.business_name)}`,
        `🔑 <b>ID:</b> <code>${escHtml(p.business_id)}</code>`,
        `🕐 <b>Fecha:</b> ${escHtml(p.created_at)}`,
      ].join('\n')

    default:
      return [
        `🔔 <b>Alerta admin: ${escHtml(alert.type)}</b>`,
        '',
        `<pre>${escHtml(JSON.stringify(p, null, 2))}</pre>`,
      ].join('\n')
  }
}

export default async function handler(req, res) {
  try {
    // Autenticación: el mismo header que usa process-email-queue.
    const secret = req.headers['x-cron-secret']
    if (secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const { data: alerts, error } = await supabase
      .from('admin_alert_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw error

    const results = []

    for (const alert of alerts || []) {
      try {
        const message = formatAlertMessage(alert)
        await sendTelegram(message)

        await supabase
          .from('admin_alert_queue')
          .update({
            status:  'sent',
            sent_at: new Date().toISOString(),
            error:   null,
          })
          .eq('id', alert.id)

        results.push({ id: alert.id, type: alert.type, ok: true })
      } catch (err) {
        const nextRetry = alert.retry_count + 1
        await supabase
          .from('admin_alert_queue')
          .update({
            status:      nextRetry >= MAX_RETRIES ? 'failed' : 'pending',
            retry_count: nextRetry,
            error:       err.message,
          })
          .eq('id', alert.id)

        results.push({ id: alert.id, type: alert.type, ok: false, error: err.message })
      }
    }

    return res.json({
      ok:        true,
      processed: results.length,
      results,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}
