import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    // Sube source maps a Sentry al buildear (requiere SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT en el entorno).
    // Sin SENTRY_AUTH_TOKEN el plugin se desactiva solo, para no romper builds locales o de contribuidores.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        // Los .map ya subidos a Sentry no quedan servidos públicamente en el dist final.
        filesToDeleteAfterUpload: ['dist/**/*.js.map'],
      },
    }),
  ],
  resolve: {
    alias: {
      components: path.resolve(__dirname, './src/components'),
      pages: path.resolve(__dirname, './src/pages'),
      services: path.resolve(__dirname, './src/services'),
      utils: path.resolve(__dirname, './src/utils'),
      hooks: path.resolve(__dirname, './src/hooks'),
      config: path.resolve(__dirname, './src/config'),
      constants: path.resolve(__dirname, './src/constants'),
      lib: path.resolve(__dirname, './src/lib'),
      contexts: path.resolve(__dirname, './src/contexts'),
    },
  },
})