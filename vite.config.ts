import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      // More specific alias must come first
      { find: '@xmldom/xmldom/lib/dom', replacement: path.resolve(__dirname, 'src/lib/xmldom-dom-shim.ts') },
      { find: '@xmldom/xmldom', replacement: path.resolve(__dirname, 'src/lib/xmldom-shim.ts') },
    ],
  },
  optimizeDeps: {
    exclude: ['epubjs'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
})
