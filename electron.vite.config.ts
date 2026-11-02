import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()]
  }
})
