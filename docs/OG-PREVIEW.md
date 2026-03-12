# Vista previa de enlaces (Open Graph) para catálogos

Para que WhatsApp, Facebook y otras redes muestren **título, descripción e imagen de cada tienda** al compartir el enlace del catálogo, se usa un **middleware en el edge** que devuelve HTML con meta OG cuando el visitante es un bot (crawler).

## Cómo funciona

- **Rutas:** `/catalogo/:slug` y `/catalog/:slug`.
- **Middleware:** `middleware.js` en la raíz del proyecto (Vercel Edge Middleware).
- Si el **User-Agent** es un bot (WhatsApp, Facebook, Telegram, etc.), se consulta el negocio en Supabase por `slug` y se responde con un HTML mínimo que solo lleva `<meta>` OG y un redirect al mismo URL.
- Si es un usuario normal, la petición sigue y se sirve la SPA como siempre.

## Variables de entorno en Vercel

En **Vercel → Project → Settings → Environment Variables** asegúrate de tener (para producción y preview):

- **`SUPABASE_URL`** — URL del proyecto Supabase (ej. `https://xxx.supabase.co`).  
  Si ya usas `VITE_SUPABASE_URL`, puedes reutilizar el mismo valor y crear también `SUPABASE_URL` con el mismo contenido, o el middleware usará `VITE_SUPABASE_URL` si existe.
- **`SUPABASE_ANON_KEY`** — Clave anónima (pública) de Supabase.  
  Igual: si tienes `VITE_SUPABASE_ANON_KEY`, puedes copiarla a `SUPABASE_ANON_KEY` o dejar solo la `VITE_*`; el middleware prueba ambas.

El middleware usa, en este orden: `SUPABASE_URL` o `VITE_SUPABASE_URL`, y `SUPABASE_ANON_KEY` o `VITE_SUPABASE_ANON_KEY`.

## Caché de WhatsApp

WhatsApp cachea la vista previa del enlace. Después de cambiar logo o nombre, el preview puede tardar en actualizarse. No hay forma oficial de invalidar ese caché; en la práctica suele actualizarse en horas o días, o al compartir una URL ligeramente distinta (por ejemplo con un query `?v=2`).
