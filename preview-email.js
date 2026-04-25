// preview-email.js
const fs = require('fs');

const emailTemplate = {
  templateName: "email-welcome-walinka",
  language: "es",
  title: "Bienvenida a Walinka",
  meta: {
    viewport: "width=device-width, initial-scale=1.0",
    charset: "UTF-8"
  },
  sections: [
    {
      id: "header",
      content: {
        logo: {
          src: "https://res.cloudinary.com/dxlqbw3mv/image/upload/v1776619815/Post_para_Instagram_Community_Manager_Catalogo_Minimalista_Negro_1_mcsw5h.png",
          alt: "Walinka"
        }
      }
    },
    {
      id: "hero",
      content: {
        badge: "¡Es oficial! ",
        title: "Bienvenido a Walinka ;)",
        greeting: "Hola, [Nombre].",
        intro: "Si llegaste hasta aquí, probablemente estés vendiendo entre chats, respondiendo lo mismo varias veces o tratando de ordenar pedidos como puedes."
      }
    },
    {
      id: "gif",
      content: {
        image: {
          src: "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExODRjeTdobm9qdmtjbDl1MHZnYmRnczEyZWZvb2Vob2x2NTIzYzZvNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3og0IKIHQspA6TDE1G/giphy.gif",
          alt: "¡Bienvenido!"
        }
      }
    },
    {
      id: "benefits",
      content: {
        description: "La idea de <strong>Walinka</strong> es simple: tener todo eso en un solo lugar, más claro y sin enredos. Queremos que dejes de ser un \"tomador de pedidos\" y te conviertas en un <strong>dueño de negocio imparable.</strong>",
        benefits: [
          { title: "Ventas 24/7", desc: "Tu catálogo trabaja mientras descansas." },
          { title: "Link Profesional", desc: "Úsalo en tu Bio de Instagram o TikTok." },
          { title: "Total del pedido", desc: "Recibe el pedido listo para despachar." }
        ]
      }
    },
    {
      id: "cta",
      content: {
        heading: "Lo más importante ahora es <br>dar el primer paso",
        buttonText: "Crea tu catálogo hoy",
        buttonUrl: "https://walinka.com/dashboard",
        note: "Con <strong>3 a 5 productos</strong> ya puedes empezar.<br>No tiene que estar perfecto, solo tiene que estar en línea."
      }
    },
    {
      id: "footer",
      content: {
        brand: "WALINKA",
        links: [
          { text: "NUESTRO BLOG", url: "https://blog.walinka.com" },
          { text: "SITIO WEB OFICIAL", url: "https://walinka.com" }
        ],
        tagline: "Vende más por WhatsApp. Sin complicaciones."
      }
    }
  ]
};

// =============================================
// GENERADOR DE HTML (preview)
// =============================================
function generatePreviewHTML(template) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #F1F5F9; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 40px; overflow: hidden; box-shadow: 0 40px 120px -20px rgba(123, 47, 247, 0.15); }
    .header { padding: 60px 20px 40px; text-align: center; }
    .hero { padding: 30px 50px; text-align: center; }
    .h1 { font-size: 34px; font-weight: 800; color: #0F172A; margin: 0 0 20px; }
    .badge { display: inline-block; background: #F5F3FF; color: #7b2ff7; padding: 6px 14px; border-radius: 100px; font-size: 11px; font-weight: 800; margin-bottom: 20px; }
    .gif { text-align: center; padding: 20px; }
    .benefits { padding: 30px 50px; background: #F9FAFB; }
    .benefit { padding: 12px 0; border-bottom: 1px solid #F1F5F9; }
    .cta { padding: 30px 50px; text-align: center; }
    .btn { display: inline-block; padding: 20px 48px; background: linear-gradient(135deg, #7b2ff7, #f127ff); color: white; text-decoration: none; border-radius: 20px; font-weight: 700; }
    .footer { padding: 40px 50px; text-align: center; background: #ffffff; border-top: 1px solid #F1F5F9; font-size: 11px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <img src="${template.sections[0].content.logo.src}" alt="${template.sections[0].content.logo.alt}" width="180">
    </div>

    <!-- Hero -->
    <div class="hero">
      <div class="badge">${template.sections[1].content.badge}</div>
      <h1 class="h1">${template.sections[1].content.title}</h1>
      <p>${template.sections[1].content.greeting}</p>
      <p>${template.sections[1].content.intro}</p>
    </div>

    <!-- GIF -->
    <div class="gif">
      <img src="${template.sections[2].content.image.src}" alt="${template.sections[2].content.image.alt}" width="280" style="border-radius: 20px;">
    </div>

    <!-- Benefits -->
    <div class="benefits">
      <p>${template.sections[3].content.description}</p>
      ${template.sections[3].content.benefits.map(b => `
        <div class="benefit">
          <strong>${b.title}:</strong> ${b.desc}
        </div>
      `).join('')}
    </div>

    <!-- CTA -->
    <div class="cta">
      <h2>${template.sections[4].content.heading}</h2>
      <a href="${template.sections[4].content.buttonUrl}" class="btn">${template.sections[4].content.buttonText}</a>
      <p style="margin-top: 20px; font-size: 14px; color: #64748B;">${template.sections[4].content.note}</p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p><strong>${template.sections[5].content.brand}</strong></p>
      <p>
        <a href="${template.sections[5].content.links[0].url}">${template.sections[5].content.links[0].text}</a> • 
        <a href="${template.sections[5].content.links[1].url}">${template.sections[5].content.links[1].text}</a>
      </p>
      <p>${template.sections[5].content.tagline}</p>
    </div>
  </div>
</body>
</html>`;
}

// =============================================
// EJECUTAR PREVIEW
// =============================================
const html = generatePreviewHTML(emailTemplate);

fs.writeFileSync('preview.html', html, 'utf8');

console.log('✅ ¡Preview generado exitosamente!');
console.log('📁 Archivo creado: preview.html');
console.log('👉 Ábrelo en tu navegador para ver el email.');