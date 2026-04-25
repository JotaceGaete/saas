// welcome.js — Email de bienvenida Walinka
// Compatible con Resend API / n8n / cualquier mailer Node.js
// Uso: const { generateWelcomeEmail, fakeData } = require('./welcome');

const DASHBOARD_URL = 'https://go.ventalink.app/dashboard';

const LOGO_URL =
  'https://res.cloudinary.com/dxlqbw3mv/image/upload/v1776619815/Post_para_Instagram_Community_Manager_Catalogo_Minimalista_Negro_1_mcsw5h.png';

const GIF_URL =
  'https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExODRjeTdobm9qdmtjbDl1MHZnYmRnczEyZWZvb2Vob2x2NTIzYzZvNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3og0IKIHQspA6TDE1G/giphy.gif';

/**
 * Genera el HTML del email de bienvenida de Walinka.
 * @param {{ displayName: string }} data
 * @returns {string} HTML listo para enviar con Resend / Nodemailer / etc.
 */
function generateWelcomeEmail({ displayName }) {
  const name = displayName || 'amigo/a';

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Bienvenida a Walinka</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(123,47,247,0.12);">

          <!-- HEADER -->
          <tr>
            <td align="center" style="padding:48px 40px 32px;background-color:#ffffff;">
              <img src="${LOGO_URL}" alt="Walinka" width="180" style="display:block;max-width:180px;height:auto;border:0;">
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td align="center" style="padding:0 40px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#F5F3FF;border-radius:100px;padding:6px 16px;">
                    <span style="font-size:11px;font-weight:700;color:#7b2ff7;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.5px;">¡Es oficial! </span>
                  </td>
                </tr>
              </table>
              <h1 style="font-size:32px;font-weight:800;color:#0F172A;margin:20px 0 16px;font-family:Arial,Helvetica,sans-serif;line-height:1.2;">
                Bienvenido a Walinka ;)
              </h1>
              <p style="font-size:16px;color:#334155;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
                Hola, <strong>${name}</strong>.
              </p>
              <p style="font-size:15px;color:#64748B;margin:0;font-family:Arial,Helvetica,sans-serif;line-height:1.7;">
                Si llegaste hasta aquí, probablemente estés vendiendo entre chats, respondiendo lo mismo varias veces o tratando de ordenar pedidos como puedes.
              </p>
            </td>
          </tr>

          <!-- GIF -->
          <tr>
            <td align="center" style="padding:16px 40px 24px;">
              <img src="${GIF_URL}" alt="¡Bienvenido!" width="280" style="display:block;max-width:280px;height:auto;border-radius:16px;border:0;">
            </td>
          </tr>

          <!-- BENEFITS -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="font-size:15px;color:#334155;margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;line-height:1.7;background-color:#F9FAFB;padding:20px;border-radius:12px;">
                La idea de <strong style="color:#7b2ff7;">Walinka</strong> es simple: tener todo eso en un solo lugar, más claro y sin enredos. Queremos que dejes de ser un "tomador de pedidos" y te conviertas en un <strong style="color:#0F172A;">dueño de negocio imparable.</strong>
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                <tr>
                  <td width="44" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:44px;height:44px;background-color:#F5F3FF;border-radius:12px;">
                          <span style="font-size:20px;line-height:44px;display:block;">🕐</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="border-bottom:1px solid #F1F5F9;padding-bottom:12px;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0F172A;font-family:Arial,Helvetica,sans-serif;">Ventas 24/7</p>
                    <p style="margin:0;font-size:13px;color:#64748B;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">Tu catálogo trabaja mientras descansas.</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                <tr>
                  <td width="44" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:44px;height:44px;background-color:#F5F3FF;border-radius:12px;">
                          <span style="font-size:20px;line-height:44px;display:block;">🔗</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="border-bottom:1px solid #F1F5F9;padding-bottom:12px;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0F172A;font-family:Arial,Helvetica,sans-serif;">Link Profesional</p>
                    <p style="margin:0;font-size:13px;color:#64748B;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">Úsalo en tu Bio de Instagram o TikTok.</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:44px;height:44px;background-color:#F5F3FF;border-radius:12px;">
                          <span style="font-size:20px;line-height:44px;display:block;">📦</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0F172A;font-family:Arial,Helvetica,sans-serif;">Total del pedido</p>
                    <p style="margin:0;font-size:13px;color:#64748B;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">Recibe el pedido listo para despachar.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DIVISOR -->
          <tr>
            <td style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #F1F5F9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:40px 40px 32px;">
              <h2 style="font-size:22px;font-weight:800;color:#0F172A;margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;line-height:1.3;">
                Lo más importante ahora es<br>dar el primer paso
              </h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:16px;background:linear-gradient(135deg,#7b2ff7 0%,#f127ff 100%);">
                    <a href="${DASHBOARD_URL}"
                       target="_blank"
                       style="display:inline-block;padding:18px 48px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;border-radius:16px;background:linear-gradient(135deg,#7b2ff7 0%,#f127ff 100%);">
                      Crea tu catálogo hoy
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;font-family:Arial,Helvetica,sans-serif;line-height:1.7;">
                Con <strong style="color:#334155;">3 a 5 productos</strong> ya puedes empezar.<br>
                No tiene que estar perfecto, solo tiene que estar en línea.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:32px 40px 40px;border-top:1px solid #F1F5F9;background-color:#FAFAFA;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0F172A;font-family:Arial,Helvetica,sans-serif;letter-spacing:2px;">WALINKA</p>
              <p style="margin:0 0 12px;font-size:11px;font-family:Arial,Helvetica,sans-serif;">
                <a href="https://blog.walinka.com" style="color:#7b2ff7;text-decoration:none;font-weight:600;letter-spacing:0.5px;">NUESTRO BLOG</a>
                <span style="color:#CBD5E1;margin:0 8px;">•</span>
                <a href="https://walinka.com" style="color:#7b2ff7;text-decoration:none;font-weight:600;letter-spacing:0.5px;">SITIO WEB OFICIAL</a>
              </p>
              <p style="margin:0;font-size:12px;color:#94A3B8;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
                Vende más por WhatsApp. Sin complicaciones.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// =============================================
// DATOS FAKE — para preview / testing local
// =============================================
const fakeData = {
  displayName: 'Valentina',
  email: 'valentina@ejemplo.com',
  createdAt: new Date().toISOString(),
};

// =============================================
// PREVIEW LOCAL — node welcome.js
// =============================================
if (require.main === module) {
  const fs = require('fs');
  const html = generateWelcomeEmail(fakeData);
  fs.writeFileSync('preview-welcome.html', html, 'utf8');
  console.log('✅ Preview generado: preview-welcome.html');
  console.log('👤 Usuario fake:', fakeData.displayName);
  console.log('🔗 CTA URL:', DASHBOARD_URL);
}

module.exports = { generateWelcomeEmail, fakeData, DASHBOARD_URL };
