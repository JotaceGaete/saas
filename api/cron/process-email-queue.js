import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail } from '../../src/emails/templates/new-order.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

const templates = {
  new_order: newOrderEmail,
}

export default async function handler(req, res) {
  try {
    const secret = req.headers['x-cron-secret']

    if (secret !== process.env.EMAIL_CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const { data: emails, error } = await supabase
      .from('email_queue')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(10)

    if (error) throw error

    const results = []

    for (const email of emails || []) {
      try {
        const templateFn = templates[email.template]

        if (!templateFn) {
          throw new Error(`Unknown email template: ${email.template}`)
        }

        const rendered = templateFn(email.payload || {})

        const to =
          process.env.EMAIL_TEST_MODE === 'true'
            ? process.env.EMAIL_TEST_INBOX
            : email.to_email

        const sent = await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to,
          subject: email.subject || rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })

        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: sent?.data?.id || null,
            last_error: null,
          })
          .eq('id', email.id)

        results.push({ id: email.id, ok: true })
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

        results.push({ id: email.id, ok: false, error: err.message })
      }
    }

    return res.json({
      ok: true,
      processed: results.length,
      results,
    })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
    })
  }
}