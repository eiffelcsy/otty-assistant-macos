import { builtinModules } from 'module'
import { resolve } from 'path'

const here = import.meta.dirname
import { defineConfig } from 'vite'

// D-47: builds only the smoke entry, into out-smoke/smoke.js. The app itself is the release build in out/, untouched,
// and electron-builder never sees out-smoke/.
export default defineConfig({
  build: {
    outDir: resolve(here, '../../out-smoke'),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    ssr: true,
    rollupOptions: {
      input: resolve(here, 'app/main.ts'),
      external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'cjs', entryFileNames: 'smoke.js' }
    }
  }
})
