import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail } from '../../src/emails/templates/new-order.js'
import { welcomeEmail } from '../../src/emails/templates/welcome.js'
import {
  onboardingTip01,
  onboardingTip02,
  onboardingTip03,
  onboardingTip04,
  onboardingTip05,
  onboardingTip06,
  onboardingTip07,
  onboardingTip08,
  onboardingTip09,
  onboardingTip10,
} from '../../src/emails/templates/onboarding-tips.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

const templates = {
  new_order: newOrderEmail,
  welcome: welcomeEmail,
  onboarding_tip_01: onboardingTip01,
  onboarding_tip_02: onboardingTip02,
  onboarding_tip_03: onboardingTip03,
  onboarding_tip_04: onboardingTip04,
  onboarding_tip_05: onboardingTip05,
  onboarding_tip_06: onboardingTip06,
  onboarding_tip_07: onboardingTip07,
  onboarding_tip_08: onboardingTip08,
  onboarding_tip_09: onboardingTip09,
  onboarding_tip_10: onboardingTip10,
}

function log(level, data) {
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ level, ts: new Date().toISOString(), ...data })
  )
}

export default async function handler(req, res) {
  try {
    if (req.headers['x-cron-secret'] !== process.env.EMAIL_CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const { data: emails, error: fetchError } = await supabase
      .from('email_queue')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) throw fetchError

    const results = []
    let sent = 0
    let failed = 0

    for (const email of emails || []) {
      const templateFn = templates[email.template]

      if (!templateFn) {
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            retry_count: 3,
            last_error: `Unknown template: ${email.template}. Available: ${Object.keys(templates).join(', ')}`,
          })
          .eq('id', email.id)

        log('error', {
          queue_id: email.id,
          template: email.template,
          status: 'failed',
          error_code: 'UNKNOWN_TEMPLATE',
        })

        results.push({ id: email.id, ok: false, error: `unknown_template:${email.template}` })
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
          })
          .eq('id', email.id)

        log('info', {
          queue_id: email.id,
          template: email.template,
          status: 'sent',
          provider_message_id,
        })

        results.push({ id: email.id, ok: true })
        sent++
      } catch (err) {
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            retry_count: email.retry_count + 1,
            next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            last_error: err.message,
          })
          .eq('id', email.id)

        log('error', {
          queue_id: email.id,
          template: email.template,
          status: 'failed',
          error_code: err.code || 'SEND_ERROR',
          error_message: err.message?.slice(0, 200),
          retry_count: email.retry_count + 1,
        })

        results.push({ id: email.id, ok: false, error: err.message })
        failed++
      }
    }

    return res.json({
      ok: true,
      processed: results.length,
      sent,
      failed,
      results,
    })
  } catch (err) {
    log('error', {
      error_code: 'HANDLER_ERROR',
      error_message: err.message?.slice(0, 200),
    })
    return res.status(500).json({ ok: false, error: err.message })
  }
}
