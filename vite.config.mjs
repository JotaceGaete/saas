import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

/** Bump al cambiar estrategia de caché PWA (invalida caches runtime con este prefijo). */
const PWA_CACHE_VERSION = "v2026-04-01-1";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  /** Siempre raíz del sitio; nunca URL absoluta (evita manifest/PWA apuntando a otro host, p. ej. www). */
  base: "/",
  define: {
    "process.env.VITE_OG_IMAGE_API_BASE": JSON.stringify(env.VITE_OG_IMAGE_API_BASE || ""),
    "process.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || ""),
    "process.env.OG_CATALOG_PUBLIC_ORIGIN": JSON.stringify(
      env.OG_CATALOG_PUBLIC_ORIGIN || env.VITE_APP_URL || "https://go.ventalink.app",
    ),
  },
  // This changes the out put dir from dist to build
  // comment this out if that isn't relevant for your project
  build: {
    outDir: "build",
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    tsconfigPaths(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "inline",
      /** Mismo nombre que en index; href en build = `${base}${manifestFilename}` → siempre origen actual (go, no www). */
      manifestFilename: "manifest.json",
      /** Alineado con `base: "/"`; el SW controla todo el origen. */
      scope: "/",
      /**
       * Manifest generado en build: solo rutas relativas (sin host).
       * No usar manifest: false + solo public/manifest.json: el plugin inyecta el <link> con buildBase correcto.
       */
      manifest: {
        name: "VentALink",
        short_name: "VentALink",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#a855f7",
        theme_color: "#a855f7",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      /** Sin SW en `vite` / dev: siempre ves el bundle en caliente; evita “código viejo” en local. */
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "v-check-isotype.svg", "offline.html"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // IMPORTANT: SPA routes must resolve to app shell when online.
        // Using offline.html here was causing iOS installed PWA to open offline page on startup.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Navigation requests: try network first; if it truly fails, show offline page.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: `app-pages-${PWA_CACHE_VERSION}`,
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
              precacheFallback: {
                fallbackURL: "/offline.html",
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: `supabase-api-${PWA_CACHE_VERSION}`,
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: "4028",
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: ['.amazonaws.com', '.ventalink.app', 'go.ventalink.app']
  }
};
});