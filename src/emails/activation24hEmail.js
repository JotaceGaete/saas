/**
 * Template: activation_24h
 * Email enviado 24h después del registro para que el usuario comparta su catálogo.
 *
 * Nota: la lógica HTML está replicada en send-email/index.ts (case 'activation_24h')
 * porque las Edge Functions de Deno no pueden importar módulos del src frontend.
 * Mantener ambos sincronizados al modificar el template.
 *
 * @param {{ businessName: string, catalogUrl: string }} data
 * @returns {{ subject: string, html: string }}
 */
export function activation24hEmail({ businessName, catalogUrl }) {
  const n = businessName || 'Tu negocio';
  const url = catalogUrl || '';

  const subject = `Tu catálogo ya está listo — ¡compártelo y recibe pedidos!`;

  const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu catálogo online está listo — compártelo ahora y empieza a recibir pedidos.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">

        <tr><td style="background:#6d28d9;padding:24px 24px 20px;color:#ffffff;">
          <p style="margin:0;font-size:13px;opacity:.9;">VentAlink</p>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Tu catálogo ya está listo 🎉</h1>
        </td></tr>

        <tr><td style="padding:24px;color:#1f2937;">
          <p style="margin:0 0 14px;font-size:16px;">Hola,</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
            Ya llevas un día en <strong>VentAlink</strong> con <strong>${n}</strong>.<br>
            Es el momento perfecto para compartir tu catálogo y empezar a recibir pedidos.
          </p>

          ${url ? `
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:10px;background:#7c3aed;">
              <a href="${url}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Ver mi catálogo →</a>
            </td></tr>
          </table>
          ` : ''}

          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Copia y pega este link donde quieras:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:0 0 20px;word-break:break-all;">
            <span style="font-family:monospace;font-size:14px;color:#7c3aed;">${url}</span>
          </div>

          <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;">Puedes compartirlo en:</p>
          <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.8;color:#374151;">
            <li>Tu estado de <strong>WhatsApp</strong></li>
            <li>Tu bio de <strong>Instagram</strong></li>
            <li>Grupos de clientes o comunidades</li>
            <li>Respuesta automática de WhatsApp</li>
          </ul>

          <p style="margin:0 0 6px;font-size:14px;color:#6d28d9;font-weight:700;">Muchos negocios reciben su primer pedido el mismo día que comparten el link.</p>
        </td></tr>

        <tr><td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Walinka — Catálogo y pedidos por WhatsApp. Si tienes dudas, responde este correo.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
