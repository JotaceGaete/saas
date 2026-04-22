import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
})