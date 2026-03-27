export default async function handler(req, res) {
  const data = { ...req.query, ...req.body };
  const paymentId = data.payment_id || data.id || '';
  const status = data.status || 'PENDING';

  // Lo mandamos a la ruta de React que creamos antes
  const url = `/billing/dlocal/return?paymentId=${paymentId}&status=${status}`;

  res.writeHead(302, { Location: url });
  res.end();
}