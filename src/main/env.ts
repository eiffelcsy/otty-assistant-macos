// D-54: build-time values electron-vite puts in main (the Google client). Declared here because no other type does.
export {}

declare global {
  interface ImportMetaEnv {
    readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
    readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
