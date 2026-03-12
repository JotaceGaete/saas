# PWA – Instalación en Android e iOS

La app Gong es instalable como PWA: el usuario puede añadirla a la pantalla de inicio en Android (Chrome) y en iOS (Safari) y abrirla como una app.

## Cómo instalar (usuario)

- **Android (Chrome):** Abre `https://app.gong.cl` → menú (⋮) → “Instalar app” o “Añadir a la pantalla de inicio”.
- **iOS (Safari):** Abre `https://app.gong.cl` → botón compartir (□↑) → “Añadir a la pantalla de inicio”.

## Qué está configurado

- **Manifest** (`public/manifest.json`): `name`, `short_name`, `start_url`, `display: standalone`, iconos 192×192 y 512×512, `theme_color`, `background_color`.
- **iOS:** Meta tags y `apple-touch-icon` en `index.html` para “Añadir a la pantalla de inicio”.
- **Service Worker:** Generado por `vite-plugin-pwa` en el build; registro inyectado en el HTML. Actualización automática cuando hay nueva versión.
- **Iconos:** Generados en `public/icon-192.png` y `public/icon-512.png` (color tema Gong). Para regenerar: `npm run pwa:icons`.

## Regenerar iconos PWA

Si cambias el logo o el color de la marca:

```bash
npm run pwa:icons
```

Esto crea de nuevo `public/icon-192.png` y `public/icon-512.png` (cuadrados con el color `#7C3AED`). Para iconos con logo, edita `scripts/generate-pwa-icons.mjs` o sustituye manualmente los PNG en `public/`.
