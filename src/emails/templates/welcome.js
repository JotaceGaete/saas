function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getDisplayName({ name, business_name, user_email }) {
  if (name && name.trim()) return name.trim()
  if (business_name && business_name.trim()) return business_name.trim()
  if (user_email && user_email.includes('@')) return user_email.split('@')[0]
  return 'Emprendedor'
}

function getBusinessLine({ business_name }) {
  if (business_name && business_name.trim())
    return `Tu tienda ${business_name.trim()} ya está lista para vender por WhatsApp.`
  return 'Tu catálogo ya está listo para vender por WhatsApp.'
}

/**
 * @param {{ name?: string, business_name?: string, user_email?: string, dashboardUrl?: string }} payload
 */
export function welcomeEmail({ name = '', business_name = '', user_email = '', dashboardUrl: payloadUrl } = {}) {
  const data = { name, business_name, user_email }
  const url = payloadUrl || 'https://go.ventalink.app/dashboard'
  const displayName = escapeHtml(getDisplayName(data))
  const businessLine = escapeHtml(getBusinessLine(data))

  return {
    subject: 'Día 1: Tu primer cliente importa más que todos 🚀',
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a Ventalink</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7C3AED 0%,#6D28D9 100%);padding:36px 40px 32px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                Ventalink
              </p>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">
                Tu catálogo de ventas por WhatsApp
              </p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
                ¡Hola, <strong>${displayName}</strong>! 👋
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#475569;">
                ${businessLine}
              </p>

              <!-- Pasos rápidos -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.05em;">
                      Primeros pasos
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e293b;">
                          ① &nbsp;Agrega tus productos con foto y precio
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e293b;">
                          ② &nbsp;Personaliza el diseño de tu catálogo
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e293b;">
                          ③ &nbsp;Comparte el link con tus clientes
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${url}"
                       style="display:inline-block;background:linear-gradient(135deg,#7C3AED 0%,#6D28D9 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.2px;">
                      Ir a mi panel →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #f1f5f9;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                Este email fue enviado a <strong>${escapeHtml(user_email || displayName)}</strong> porque creaste una cuenta en Ventalink.<br/>
                Si no reconoces esta cuenta, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `¡Hola, ${displayName}!

${businessLine}

Primeros pasos:
1. Agrega tus productos con foto y precio
2. Personaliza el diseño de tu catálogo
3. Comparte el link con tus clientes

Ir a tu panel: ${url}

---
Ventalink · Tu catálogo de ventas por WhatsApp
`,
  }
}
