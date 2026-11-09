import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Entorno de Vercel en el que se compila (production | preview | development).
// Vite solo expone variables VITE_*: sin esto, el código no sabe que es una
// Preview cuando se abre por una URL que no es el alias de rama
// (saas-<hash>-….vercel.app o un dominio asignado a la Preview).
const vercelEnv = process.env.VITE_VERCEL_ENV || process.env.VERCEL_ENV || ''

export default defineConfig({
  plugins: [react()],
  define: vercelEnv ? { 'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(vercelEnv) } : {},
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