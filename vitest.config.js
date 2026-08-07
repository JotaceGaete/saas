import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Config de test separada de vite.config.js a propósito: `vite build` no lee
// este archivo, así que agregar entorno/deps de test no puede afectar el build
// de producción. Mismos alias que vite.config.js para que los imports
// (contexts/..., components/..., etc.) resuelvan igual en tests.
export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    // @testing-library/jest-dom v5 extiende `expect` global (convención Jest) al importarse
    // en setupTests.js — necesita `globals: true` para encontrarlo. No afecta `vite build`.
    globals: true,
  },
})
