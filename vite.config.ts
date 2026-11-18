import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'frontend',
  build: {
    outDir: '../dist/workspace',
    emptyOutDir: true,
    rollupOptions: { input: resolve('frontend/workspace.html') },
  },
  server: { proxy: { '/api': 'http://localhost:3001', '/account': 'http://localhost:3001' } },
})
