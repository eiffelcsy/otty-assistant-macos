import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: renders the real renderer views in a browser with a mock `window.otty`, for UI work. Not shipped.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5199, strictPort: true, fs: { allow: [resolve(__dirname, '../..')] } }
})
