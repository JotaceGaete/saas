import { createClient } from '@supabase/supabase-client';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Usa la Service Role para saltar RLS en el backend
);

export default async function handler(req, res) {
  // dLocal siempre envía POST
  if (req.method !== 'POST') return res.status(405).end();

  const { id, payment_id, status, amount, currency } = req.body;
  const pId = payment_id || id;

  try {
    // 1. Actualizamos el registro del pago en wa_payments
    const { data: payment, error: pError } = await supabase
      .from('wa_payments')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('payment_id', pId)
      .select('business_id')
      .single();

    if (pError) throw pError;

    // 2. Si el estado es PAID, activamos la suscripción del negocio
    if (status === 'PAID' && payment?.business_id) {
      const { error: sError } = await supabase
        .from('billing_subscriptions')
        .update({ 
          billing_status: 'active',
          last_payment_date: new Date().toISOString()
        })
        .eq('business_id', payment.business_id);

      if (sError) throw sError;
    }

    // 3. RESPUESTA CRÍTICA: Siempre 200 OK para dLocal
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Error procesando Webhook de dLocal:", error.message);
    // Respondemos 200 igual para evitar que dLocal bloquee tu endpoint por "errores" constantes
    return res.status(200).json({ error: "Processed with internal log" });
  }
}