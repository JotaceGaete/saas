import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailAutomationDisabledPayload, isEmailAutomationEnabled } from '../../src/emails/automation.mjs'
import { newOrderEmail } from '../../src/emails/templates/new-order.js'
import { welcomeEmail } from '../../src/emails/templates/welcome.js'

const MAX_RETRIES = 3
const DEFAULT_BATCH_SIZE = 5
const MAX_BATCH_SIZE = 20
const RETRY_DELAY_MINUTES = [15, 30, 60]

const templates = {
  new_order: newOrderEmail,
  welcome: welcomeEmail,
}

function log(level, data) {
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ level, ts: new Date().toISOString(), ...data })
  )
}

function getBatchSize() {
  const raw = Number.parseInt(process.env.EMAIL_QUEUE_BATCH_SIZE || '', 10)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_SIZE
  return Math.min(raw, MAX_BATCH_SIZE)
}

function getCronSecret() {
  return process.env.EMAIL_CRON_SECRET || process.env.CRON_SECRET || null
}

function getRetryDelayMinutes(nextRetry) {
  return RETRY_DELAY_MINUTES[Math.max(0, nextRetry - 1)] || RETRY_DELAY_MINUTES[RETRY_DELAY_MINUTES.length - 1]
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    if (!isEmailAutomationEnabled(process.env)) {
      const payload = emailAutomationDisabledPayload()
      log('info', { status: 'skipped', reason: payload.reason })
      return res.status(200).json(payload)
    }

    const cronSecret = getCronSecret()
    if (!cronSecret || req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    const resend = new Resend(process.env.RESEND_API_KEY)

    const batchSize = getBatchSize()
    const { data: emails, error: fetchError } = await supabase
      .from('email_queue')
      .select('id, template, payload, to_email, subject, retry_count')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (fetchError) throw fetchError

    let sent = 0
    let failed = 0

    for (const email of emails || []) {
      const templateFn = templates[email.template]

      if (!templateFn) {
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            retry_count: MAX_RETRIES,
            next_attempt_at: null,
            last_error: `Unknown template: ${email.template}. Available: ${Object.keys(templates).join(', ')}`,
          })
          .eq('id', email.id)

        log('error', {
          queue_id: email.id,
          template: email.template,
          status: 'failed',
          error_code: 'UNKNOWN_TEMPLATE',
        })

        failed++
        continue
      }

      try {
        const rendered = templateFn(email.payload || {})
        const to = process.env.EMAIL_TEST_MODE === 'true'
          ? process.env.EMAIL_TEST_INBOX
          : email.to_email

        const { data: sendData } = await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to,
          subject: email.subject || rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })

        const provider_message_id = sendData?.id || null

        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id,
            last_error: null,
            next_attempt_at: null,
          })
          .eq('id', email.id)

        sent++
      } catch (err) {
        const nextRetry = email.retry_count + 1
        const exhausted = nextRetry >= MAX_RETRIES
        const nextAttemptAt = exhausted
          ? null
          : new Date(Date.now() + getRetryDelayMinutes(nextRetry) * 60 * 1000).toISOString()

        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            retry_count: nextRetry,
            next_attempt_at: nextAttemptAt,
            last_error: err.message,
          })
          .eq('id', email.id)

        log('error', {
          queue_id: email.id,
          template: email.template,
          status: 'failed',
          error_code: err.code || 'SEND_ERROR',
          error_message: err.message?.slice(0, 200),
          retry_count: nextRetry,
          exhausted,
        })

        failed++
      }
    }

    log('info', {
      status: 'completed',
      batch_size: batchSize,
      fetched: emails?.length || 0,
      sent,
      failed,
    })

    return res.json({
      ok: true,
      processed: (emails || []).length,
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
