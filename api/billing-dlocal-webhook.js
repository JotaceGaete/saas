import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = req.body;
  // dLocal envía 'id' o 'payment_id'
  const paymentId = payload.id || payload.payment_id;
  const status = payload.status; // 'PAID', 'REJECTED', etc.

  try {
    // 1. Actualizar la tabla de pagos
    // Ajusta el nombre de la columna si en tu tabla es 'dlocal_id' o similar
    const { data: payment, error: pError } = await supabase
      .from('wa_payments')
      .update({ 
        status: status,
        updated_at: new Date().toISOString() 
      })
      .eq('payment_id', paymentId) // El DP-213770 que vimos en el log
      .select('business_id')
      .single();

    if (pError) throw pError;

    // 2. Si el pago está pagado, activar el plan PRO
    if (status === 'PAID' && payment?.business_id) {
      await supabase
        .from('billing_subscriptions')
        .update({ 
          billing_status: 'active',
          plan_slug: 'pro', // El slug que venía en tu log
          last_payment_date: new Date().toISOString()
        })
        .eq('business_id', payment.business_id);
    }

    // dLocal necesita un 200 para dejar de reintentar
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error Webhook:", error.message);
    return res.status(200).json({ error: "Handled" }); 
  }
}