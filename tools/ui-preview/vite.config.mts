import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicy } from '../../csp.config'

// Dev-only: renders the real renderer views in a browser with a mock `window.otty`, for UI work. Not shipped.
// `ui-preview-csp` builds it with the app's Content Security Policy, to check that something works under it.
export default defineConfig({
  root: __dirname,
  plugins: [react(), contentSecurityPolicy],
  build: { outDir: resolve(__dirname, '../../out/ui-preview'), emptyOutDir: true },
  server: { port: 5199, strictPort: true, fs: { allow: [resolve(__dirname, '../..')] } },
  preview: { port: 5198, strictPort: true }
})
