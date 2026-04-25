// onboarding-tips.js — Secuencia de 10 tips de onboarding para Ventalink
// CJS: const { onboardingTip01 } = require('./onboarding-tips')
// Cada función acepta el payload de email_queue y retorna { subject, html, text }

const DASHBOARD_URL = 'https://go.ventalink.app/dashboard';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDisplayName(data) {
  return (
    (data.name && data.name.trim()) ||
    (data.business_name && data.business_name.trim()) ||
    (data.user_email && data.user_email.includes('@') && data.user_email.split('@')[0]) ||
    'Emprendedor'
  );
}

/**
 * Genera HTML de email compartido para todos los tips.
 * @param {{ name: string, dayLabel: string, headline: string, body: string, steps: string[], ctaLabel: string }} opts
 * @returns {string}
 */
function buildTipHtml({ name, dayLabel, headline, body, steps, ctaLabel }) {
  const safeSteps = steps
    .map(
      (s, i) =>
        `<p style="margin:0 0 8px;font-size:14px;color:#1e293b;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">` +
        `<strong style="color:#7b2ff7;">${i + 1}.</strong> ${escapeHtml(s)}</p>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td align="center" bgcolor="#7b2ff7" style="background-color:#7b2ff7;padding:28px 40px;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#e9d5ff;font-family:Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(dayLabel)}</p>
              <p style="margin:6px 0 0;font-size:24px;font-weight:800;color:#ffffff;font-family:Arial,Helvetica,sans-serif;line-height:1.2;">Ventalink</p>
            </td>
          </tr>

          <!-- GREETING -->
          <tr>
            <td style="padding:32px 40px 0;background-color:#ffffff;">
              <p style="margin:0 0 8px;font-size:15px;color:#64748B;font-family:Arial,Helvetica,sans-serif;">
                Hola, <strong style="color:#0F172A;">${escapeHtml(name)}</strong>.
              </p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0F172A;font-family:Arial,Helvetica,sans-serif;line-height:1.3;">
                ${escapeHtml(headline)}
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#334155;font-family:Arial,Helvetica,sans-serif;line-height:1.7;">
                ${escapeHtml(body)}
              </p>
            </td>
          </tr>

          <!-- STEPS -->
          <tr>
            <td style="padding:0 40px 28px;background-color:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8F7FF" style="background-color:#F8F7FF;border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;">
                    ${safeSteps}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:0 40px 36px;background-color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#7b2ff7" style="background-color:#7b2ff7;border-radius:10px;">
                    <a href="${DASHBOARD_URL}"
                       target="_blank"
                       style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;border-radius:10px;">
                      ${escapeHtml(ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:20px 40px 32px;border-top:1px solid #F1F5F9;background-color:#FAFAFA;">
              <p style="margin:0;font-size:12px;color:#94A3B8;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
                Ventalink &mdash; Tu cat&aacute;logo de ventas por WhatsApp
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

// ─────────────────────────────────────────────────────────────────
// TIP 01 — +24 horas
// ─────────────────────────────────────────────────────────────────
function onboardingTip01(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 2: \u00bfYa subiste tu primer producto? \ud83d\udce6',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 2',
      headline: 'Un cat\u00e1logo vac\u00edo no vende. Empieza con 3 productos.',
      body: 'El error m\u00e1s com\u00fan al abrir una tienda es esperar tener todo listo. No esperes. Con solo 3 productos ya puedes empezar a recibir pedidos hoy.',
      steps: [
        'Entra a tu panel y haz clic en "Productos".',
        'Sube una foto, pon nombre y precio.',
        'Repite 2 veces m\u00e1s. \u00a1Listo!',
      ],
      ctaLabel: 'Subir mis primeros productos \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 2: Un cat\u00e1logo vac\u00edo no vende. Empieza con 3 productos.\n\n' +
      'El error m\u00e1s com\u00fan al abrir una tienda es esperar tener todo listo. No esperes.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 02 — +2 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip02(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 3: Tu cat\u00e1logo merece ser visto \ud83d\udc40',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 3',
      headline: '\u00bfQu\u00e9 pasa si nadie ve tu tienda?',
      body: 'Tener el cat\u00e1logo listo es el primer paso. El segundo es compartirlo. Tu link de Ventalink funciona en WhatsApp, Instagram, TikTok y cualquier red social.',
      steps: [
        'Copia tu link desde el panel (es algo como ventalink.app/tu-tienda).',
        'P\u00f3nlo en tu bio de Instagram o TikTok.',
        'Env\u00edalo por WhatsApp a tus mejores 10 contactos.',
      ],
      ctaLabel: 'Ver mi link \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 3: \u00bfQu\u00e9 pasa si nadie ve tu tienda?\n\n' +
      'Comparte tu link en tu bio y por WhatsApp. Con 10 contactos ya tienes potencial de venta.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 03 — +3 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip03(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 4: Una buena foto vale m\u00e1s que 1.000 palabras \ud83d\udcf8',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 4',
      headline: 'Las fotos son tu vendedor silencioso.',
      body: 'Los productos con buenas fotos reciben hasta 3 veces m\u00e1s clics. No necesitas c\u00e1mara profesional: tu tel\u00e9fono es suficiente si sigues estos pasos.',
      steps: [
        'Usa luz natural. Abre una ventana y pon el producto frente a ella.',
        'Fondo blanco o neutro: una hoja A4, una pared o una mesa limpia.',
        'Toma la foto desde arriba o al frente. Sin flash.',
      ],
      ctaLabel: 'Mejorar mis fotos \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 4: Las fotos son tu vendedor silencioso.\n\n' +
      'Luz natural + fondo neutro + sin flash = fotos que venden. No necesitas c\u00e1mara profesional.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 04 — +4 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip04(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 5: El precio es psicolog\u00eda. \u00bfEl tuyo vende? \ud83d\udcb0',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 5',
      headline: 'C\u00f3mo poner precios que la gente acepta sin dudar.',
      body: 'El precio no es solo un n\u00famero: es un mensaje. Saber c\u00f3mo mostrarlo puede aumentar tus ventas sin bajar ni un peso.',
      steps: [
        'Termina en 90 o 99: $9.990 se percibe mucho m\u00e1s barato que $10.000.',
        'Muestra el precio anterior tachado si tienes oferta.',
        'Usa descripciones que justifiquen el precio: "hecho a mano", "entrega r\u00e1pida", "premium".',
      ],
      ctaLabel: 'Ajustar mis precios \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 5: El precio es psicolog\u00eda.\n\n' +
      '$9.990 vende m\u00e1s que $10.000. Termina en 90 o 99 y muestra precio anterior si tienes oferta.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 05 — +5 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip05(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 6: Tu tienda, tu marca \ud83c\udfa8',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 6',
      headline: 'Una tienda con identidad genera m\u00e1s confianza.',
      body: 'Los compradores conf\u00edan m\u00e1s en tiendas que tienen una imagen clara. Solo te toma 5 minutos personalizar la tuya.',
      steps: [
        'Sube tu logo desde el panel en "Dise\u00f1o".',
        'Elige un color principal que represente tu negocio.',
        'Agrega una descripci\u00f3n corta de tu tienda (1 o 2 oraciones).',
      ],
      ctaLabel: 'Personalizar mi tienda \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 6: Una tienda con identidad genera m\u00e1s confianza.\n\n' +
      'Sube tu logo, elige un color y agrega una descripci\u00f3n. Solo 5 minutos.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 06 — +6 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip06(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 7: As\u00ed se ve un negocio organizado \ud83d\udccb',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 7',
      headline: 'Recibir un pedido es s\u00f3lo el inicio.',
      body: 'Muchos emprendedores pierden ventas por no tener claro el proceso post-pedido. Un flujo simple te ayuda a responder r\u00e1pido y generar confianza.',
      steps: [
        'Cuando llegue un pedido, conf\u00edrmalo por WhatsApp en menos de 2 horas.',
        'Ind\u00edcale al cliente el tiempo de entrega y el m\u00e9todo de pago.',
        'Usa la secci\u00f3n "Pedidos" en Ventalink para hacer seguimiento.',
      ],
      ctaLabel: 'Ver mis pedidos \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 7: Recibir un pedido es solo el inicio.\n\n' +
      'Conf\u00edrmalo en menos de 2 horas. Ind\u00edcale al cliente el tiempo de entrega y m\u00e9todo de pago.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 07 — +7 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip07(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 8: Llevas una semana. \u00bfC\u00f3mo vas? \ud83d\ude80',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 8',
      headline: 'Una semana es suficiente para tener claridad.',
      body: 'Lleva 7 d\u00edas con tu tienda activa. Es el momento ideal para hacer una pausa y revisar qu\u00e9 est\u00e1 funcionando y qu\u00e9 no.',
      steps: [
        '\u00bfCu\u00e1ntas vistas tuvo tu cat\u00e1logo esta semana?',
        '\u00bfAlguien te consult\u00f3 por WhatsApp? \u00bfCu\u00e1ntos compraron?',
        'Si no hubo consultas: comparte tu link en 3 grupos o estados de WhatsApp hoy.',
      ],
      ctaLabel: 'Revisar mi tienda \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 8: Una semana es suficiente para tener claridad.\n\n' +
      '\u00bfCu\u00e1ntas vistas? \u00bfAlguien te consult\u00f3? Si no hubo tracci\u00f3n, comparte en 3 grupos hoy.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 08 — +8 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip08(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 9: Las palabras tambi\u00e9n venden \ud83d\udda5\ufe0f',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 9',
      headline: 'Una buena descripci\u00f3n convierte dudas en ventas.',
      body: 'La foto atrae. La descripci\u00f3n convence. Si tu descripci\u00f3n dice solo "camisa azul talla M", est\u00e1s perdiendo ventas.',
      steps: [
        'Empieza con el beneficio: "Abrigadora y liviana para el d\u00eda a d\u00eda."',
        'Agrega detalles t\u00e9cnicos: talla, material, medidas si aplica.',
        'Termina con una acci\u00f3n: "Disponible para entrega inmediata."',
      ],
      ctaLabel: 'Editar mis productos \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 9: Las palabras tambi\u00e9n venden.\n\n' +
      'Empieza con el beneficio, agrega detalles y termina con disponibilidad. Simple y efectivo.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 09 — +9 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip09(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 10: Convierte chats en ventas \ud83d\udcac',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 10',
      headline: 'WhatsApp no es solo mensajes: es tu canal de ventas.',
      body: 'Tus clientes ya est\u00e1n en WhatsApp. La clave es responder r\u00e1pido y guiarlos hacia el pedido sin que se sientan presionados.',
      steps: [
        'Responde en menos de 1 hora: la velocidad genera confianza.',
        'Cuando alguien pregunte el precio, env\u00edales directo el link de tu cat\u00e1logo.',
        'Si no compran hoy, escr\u00edbeles en 48 horas con un mensaje corto: "\u00bfA\u00fan te interesa?"',
      ],
      ctaLabel: 'Ver mi cat\u00e1logo \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 10: WhatsApp no es solo mensajes: es tu canal de ventas.\n\n' +
      'Responde en menos de 1 hora. Env\u00eda el link del cat\u00e1logo. Haz seguimiento a las 48 horas.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// TIP 10 — +10 días
// ─────────────────────────────────────────────────────────────────
function onboardingTip10(data) {
  if (!data) data = {};
  const name = getDisplayName(data);
  return {
    subject: 'D\u00eda 11: 10 d\u00edas. \u00bfCu\u00e1l es tu pr\u00f3xima meta? \ud83c\udfaf',
    html: buildTipHtml({
      name,
      dayLabel: 'Tip del d\u00eda 11',
      headline: 'Ya tienes las bases. Ahora escala.',
      body: 'Completaste tus primeros 10 d\u00edas con Ventalink. Si seguiste los tips, ya tienes una tienda activa, fotos decentes y un proceso de venta. Ahora \u00e9s el momento de pensar en grande.',
      steps: [
        'Meta del mes 2: llegar a 10 productos en tu cat\u00e1logo.',
        'Publica tu link en al menos 5 grupos o comunidades de WhatsApp.',
        'Pide a tus primeros clientes que te dejen una rese\u00f1a o te recomienden.',
      ],
      ctaLabel: 'Planificar mi mes 2 \u2192',
    }),
    text:
      'Hola ' + name + '.\n\n' +
      'D\u00eda 11: Ya tienes las bases. Ahora escala.\n\n' +
      'Meta del mes 2: 10 productos, 5 grupos de WhatsApp, primeras rese\u00f1as.\n\n' +
      'Ir a tu panel: ' + DASHBOARD_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// FAKE DATA — para preview / testing local
// ─────────────────────────────────────────────────────────────────
const fakeData = {
  name: 'Valentina',
  business_name: 'Tienda Demo',
  user_email: 'valentina@ejemplo.com',
};

module.exports = {
  onboardingTip01,
  onboardingTip02,
  onboardingTip03,
  onboardingTip04,
  onboardingTip05,
  onboardingTip06,
  onboardingTip07,
  onboardingTip08,
  onboardingTip09,
  onboardingTip10,
  fakeData,
};
