// src/emails/templates/news.js

const DASHBOARD_URL = 'https://go.ventalink.app/dashboard';

function newsEmail({ displayName }) {
  const name = displayName || 'Emprendedor';

  const subject = 'Tu catálogo ya tiene movimiento 🎥';

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr>
<td align="center">

<table width="600" style="background:#ffffff;border-radius:20px;padding:40px;">

<tr>
<td style="text-align:center;">
<h1 style="margin:0;color:#0F172A;">Tu catálogo ahora se mueve 🎥</h1>
</td>
</tr>

<tr>
<td style="padding-top:24px;color:#334155;font-size:15px;line-height:1.7;">

<p>Hola <strong>${name}</strong>,</p>

<p>
Hay una mejora importante en Walinka que queríamos contarte:
<strong>ahora puedes subir videos en tus productos.</strong>
</p>

<p>
Sí, así como lo lees.
Tu catálogo ya no es solo fotos… ahora puede mostrar movimiento, detalles y cómo se usa realmente tu producto.
</p>

<p>
Y esto cambia mucho:
</p>

<ul style="padding-left:18px;">
<li>📲 Genera más confianza</li>
<li>👀 Capta más atención</li>
<li>💬 Aumenta las probabilidades de que te escriban</li>
</ul>

<p>
Si vendes algo visual (ropa, comida, servicios, lo que sea), un video puede marcar la diferencia.
</p>

<p style="text-align:center;margin:32px 0;">
<a href="${DASHBOARD_URL}"
style="background:#7b2ff7;color:#fff;padding:16px 28px;text-decoration:none;border-radius:12px;font-weight:bold;">
Subir mi primer video 🚀
</a>
</p>

<p style="font-size:14px;color:#64748B;">
No tiene que ser perfecto. Un video simple, real, ya suma.
</p>

<p style="margin-top:24px;">
Seguimos mejorando Walinka para ayudarte a vender más fácil.<br>
<strong>Se vienen más cosas 👀</strong>
</p>

<p style="margin-top:24px;">
Un abrazo,<br>
<strong>Equipo Walinka</strong>
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

  const text = `
Hola ${name},

Tu catálogo ahora tiene una mejora importante:
ya puedes subir videos en tus productos.

Esto ayuda a:
- generar confianza
- captar más atención
- aumentar mensajes

Puedes probarlo aquí:
${DASHBOARD_URL}

No tiene que ser perfecto, un video simple ya marca la diferencia.

Equipo Walinka
`;

  return { subject, html, text };
}

module.exports = { newsEmail };