export default async function handler(req, res) {
  // dLocal suele enviar parámetros en la URL cuando hace el redirect
  const queryParams = req.query || {};
  const status = (queryParams.status || '').toUpperCase();
  const paymentId = queryParams.payment_id || queryParams.id || 'desconocido';

  console.log(`[dLocal Callback] Usuario regresó. ID: ${paymentId} | Estado: ${status}`);

  // Base de tu página de planes
  let redirectUrl = 'https://go.ventalink.app/planes';

  // Si dLocal nos dice que está pagado o al menos pendiente (procesando)
  if (status === 'PAID' || status === 'PENDING' || status === 'APPROVED') {
    redirectUrl += '?payment=success';
  } else if (status === 'REJECTED' || status === 'CANCELLED') {
    redirectUrl += '?payment=failure';
  } else {
    // Si dLocal no manda estado, forzamos un success temporal 
    // para que no salga la alerta roja mientras el Webhook hace su trabajo por detrás.
    redirectUrl += '?payment=success'; 
  }

  res.writeHead(302, { Location: redirectUrl });
  res.end();
}