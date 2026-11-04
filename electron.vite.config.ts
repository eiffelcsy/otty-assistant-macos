import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Built pages only reach their own files, so nothing in an answer can call out to another server.
// Build-only because Vite's dev server needs inline scripts and a socket.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const contentSecurityPolicy: Plugin = {
  name: 'otty-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }
  ]
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      // The file reader runs in its own utility process (src/main/files/index.ts forks fileWorker.js).
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts'), fileWorker: resolve(__dirname, 'src/main/files/worker.ts') }
      }
    }
  },
  preload: {
    build: { outDir: 'out/preload' }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    },
    plugins: [react(), contentSecurityPolicy]
  }
})
