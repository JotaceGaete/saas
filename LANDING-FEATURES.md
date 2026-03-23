# Características y funciones para la landing page — Ventalink

Usa este listado para copiar en la landing, páginas legales o material de marketing.

---

## Resumen en una frase
**Catálogo online conectado a WhatsApp: crea tu tienda, agrega productos, comparte un link y recibe pedidos directamente en tu WhatsApp.**

---

## Por área

### Catálogo público (tu tienda en un link)
- **Link único de catálogo** — Un solo enlace para compartir en Instagram, Facebook, WhatsApp o historias.
- **100% mobile-first** — Diseñado para que tus clientes naveguen y compren desde el celular.
- **Vista "Todos"** — Todos los productos en una sola grilla continua, sin secciones por categoría (opcional).
- **Filtro por categorías** — Solo se muestran categorías con productos; filtro por categoría específica.
- **Búsqueda y filtro por precio** — Los clientes pueden buscar y acotar por rango de precios.
- **Carrito y pedido por WhatsApp** — El mensaje del pedido se genera solo con productos, cantidades y total; un clic abre WhatsApp.
- **Vista compacta o destacada** — El dueño elige si el catálogo se ve en tarjetas grandes o en cuadrícula compacta.
- **Multi-imagen por producto** — Varias fotos por producto en el catálogo público.
- **Productos destacados** — Marca productos como destacados para resaltarlos.
- **Visitas al catálogo** — Registro de visitas para métricas (según implementación).

### Productos
- **Alta y edición de productos** — Nombre, precio, descripción, categoría, estado activo/inactivo.
- **Fotos de productos** — Subida de imágenes; múltiples imágenes por producto.
- **Categorías** — Por rubro del negocio; organización por categorías en el catálogo.
- **Variantes/opciones** — Productos con opciones (ej. talles, colores) y precios o descripciones por variante.
- **Orden y destacados** — Orden de aparición (sort_order) y marca de producto destacado.
- **Gestión masiva** — Activar/desactivar o eliminar varios productos a la vez.
- **Filtros y orden** — En el panel: por nombre, precio, estado, categoría; búsqueda por texto.

### IA (Inteligencia Artificial)
- **Mejorar descripción con IA** — En el editor de producto, un botón mejora la descripción con IA (OpenAI): texto comercial, llamada a la acción y hashtags para redes. Disponible en planes Pro y Business.

### Pedidos
- **Pedidos en un solo lugar** — Listado de pedidos con estado (Pedido, En preparación, Enviado, Entregado, Cancelado).
- **Estado de pago** — Pendiente, Pagado, Anulado.
- **Notificaciones en tiempo real** — Nuevos pedidos aparecen al instante en el dashboard (Supabase Realtime).
- **Resumen por pedido** — Productos, cantidades, total, datos del cliente y mensaje.
- **Transferencia bancaria** — Sección para datos de transferencia (banco, cuenta, titular, etc.) por país (Chile/Argentina).
- **Imprimir pedido** — Modal para imprimir el detalle del pedido.

### Configuración del negocio
- **Datos del negocio** — Nombre, descripción, WhatsApp, email, dirección, ciudad, región, país, moneda.
- **Logo y portada** — Subida de logo e imagen de portada; se muestran en el catálogo público.
- **Slug único** — URL amigable del tipo `/catalogo/mi-tienda` o `/catalog/mi-tienda`.
- **Rubro y categorías** — Selección de rubro; categorías del rubro para productos.
- **Plantilla de mensaje de pedido** — Personalización del texto que acompaña al pedido por WhatsApp.
- **Métodos de pago** — Efectivo, transferencia, tarjeta, MercadoPago, PayPal, Nequi/Daviplata (configurables).
- **Opciones de entrega** — Retiro en tienda, entrega local (con costo opcional), envío nacional.
- **Datos bancarios** — Para transferencia (banco, tipo de cuenta, número, titular, RUT/CUIT según país).

### Diseño del catálogo
- **Temas** — Minimal, Gradient, Dark.
- **Color primario** — Paleta de colores (violeta, índigo, rosa, naranja, teal, esmeralda, etc.).
- **Tipografías** — Inter, Urbanist, Poppins.
- **Estilo del catálogo** — Clásico, Minimal, Destacado (sombras y espaciado).
- **Layout** — Lista, Cuadrícula o Tarjeta.
- **Vista en móvil** — Destacada (tarjetas grandes) o compacta (2 columnas).
- **Cabecera de tienda** — Mostrar/ocultar nombre, descripción y botón de WhatsApp.
- **Tarjetas de producto** — Mostrar/ocultar precio, descripción, stock, botón WhatsApp.
- **Vista previa en vivo** — Panel de previsualización del catálogo mientras configuras (escritorio/móvil).

### Dashboard
- **Métricas** — Productos activos, pedidos pendientes, pedidos de la semana.
- **Pedidos por día** — Gráfico de pedidos en los últimos 7 días.
- **Productos más vendidos** — Top productos.
- **Ingresos del mes** — Ingresos mensuales (según pedidos).
- **Visitas al catálogo** — Estadísticas de visitas (si está habilitado).
- **Uso del plan** — Productos usados vs límite; pedidos del mes vs límite (según plan).
- **Enlace al catálogo** — Copiar link con un clic; QR o compartir.
- **Accesos rápidos** — Ir a productos, pedidos, configuración.
- **Actividad reciente** — Feed de actividad o pedidos recientes.
- **Alertas de plan** — Aviso cuando el plan está por vencer o vencido.

### Planes y precios
- **Plan Starter (gratis)** — Hasta 10 productos, hasta 30 pedidos/mes; ideal para empezar.
- **Plan Pro** — Hasta 50 productos, pedidos ilimitados; incluye IA para mejorar descripciones; prueba gratis de 7 días.
- **Plan Business** — Productos y pedidos ilimitados; IA incluida.
- **Pago por país** — Chile: Mercado Pago (CLP). Resto: precios USD de referencia y activación por contacto.
- **Branding** — En plan gratis se muestra “Creado con Ventalink” en el mensaje de pedido; en planes de pago no.

### Experiencia de usuario
- **Registro y login** — Email y contraseña; registro con nombre de negocio y WhatsApp.
- **Multi-país** — Soporte para Chile y Argentina (moneda, formato WhatsApp, direcciones, bancos).
- **PWA (Progressive Web App)** — Instalable en el celular; banner de “Instalar app”.
- **Responsive** — Panel de administración y catálogo usables en móvil y escritorio.
- **Páginas legales** — Términos, privacidad, reembolsos; página de precios pública.

### Administración (admin)
- **Panel admin** — Gestión de negocios y pagos (según permisos).
- **Pagos** — Vista de pagos/admin de planes (AdminPaymentsPage).

---

## Frases cortas para bullets o tarjetas

- Catálogo en un link para WhatsApp  
- Pedidos directos a tu WhatsApp  
- IA para mejorar descripciones de productos (planes Pro/Business)  
- Dashboard con métricas y pedidos en tiempo real  
- Personalización total: colores, fuentes y estilo del catálogo  
- Retiro, entrega local y envío nacional  
- Múltiples métodos de pago (transferencia, efectivo, MercadoPago, etc.)  
- Productos con variantes y varias fotos  
- Empezar gratis; planes Pro y Business para crecer  
- Instalable como app en el celular (PWA)  
- Chile y Argentina: moneda y datos locales  

---

## Para la sección “Cómo funciona”

1. **Crea tu negocio** — Registra nombre, logo, WhatsApp y personaliza tu perfil.  
2. **Agrega tus productos** — Sube fotos, precios y descripciones; opcionalmente usa IA para mejorar textos.  
3. **Comparte tu link** — En redes o WhatsApp; tus clientes ven el catálogo y envían el pedido a tu WhatsApp.  

---

*Documento generado a partir del código del proyecto. Actualizar cuando se añadan nuevas funciones.*
