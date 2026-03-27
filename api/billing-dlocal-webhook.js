import { createClient } from '@supabase/supabase-js';

// Inicialización fuera del handler para reutilizar conexión
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 1. dLocal solo envía POST
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook activo');
  }

  try {
    // 2. Extraer el body. A veces en Vercel req.body ya viene parseado, 
    // pero si es un string, lo parseamos.
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    const paymentId = payload.id || payload.payment_id;
    const status = payload.status;
    const businessIdFromOrder = payload.order_id; // Útil como respaldo

    console.log(`[dLocal Webhook] ID: ${paymentId} | Estado: ${status}`);

    if (!paymentId) {
      return res.status(200).json({ success: false, error: 'No payment_id in payload' });
    }

    // 3. Actualizar tabla de pagos
    const { data: payment, error: pError } = await supabase
      .from('wa_payments')
      .update({ 
        status: status,
        updated_at: new Date().toISOString() 
      })
      .eq('provider_payment_id', paymentId)
      .select('business_id')
      .single();

    // 4. Si el pago es exitoso, activar el plan
    if (status === 'PAID') {
      // Usamos el businessId que viene de la base de datos o lo extraemos del order_id si falló lo anterior
      const finalBusinessId = payment?.business_id;

      if (finalBusinessId) {
        await supabase
          .from('billing_subscriptions')
          .update({ 
            billing_status: 'active',
            plan_slug: 'pro',
            last_payment_date: new Date().toISOString()
          })
          .eq('business_id', finalBusinessId);
          
        console.log(`[dLocal Webhook] Plan PRO activado para: ${finalBusinessId}`);
      }
    }

    // 5. SIEMPRE responder 200 a dLocal para que no reintente
    return res.status(200).json({ success: true, message: 'Processed' });

  } catch (error) {
    console.error("Error crítico en Webhook:", error.message);
    // Respondemos 200 aunque falle la DB para que dLocal no marque 503
    return res.status(200).json({ success: false, error: error.message });
  }
}