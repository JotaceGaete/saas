export function newOrderEmail(payload) {
  return {
    subject: 'Nuevo pedido en Ventalink',
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>🔥 Nuevo pedido</h2>
        <p>Esto es una prueba de tu sistema de correos.</p>
        <p>Todo está funcionando correctamente.</p>
      </div>
    `,
    text: 'Nuevo pedido - prueba funcionando'
  }
}