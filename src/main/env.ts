// D-54: build-time values electron-vite puts in main (the Google client). Declared here because no other type does.
export {}

declare global {
  interface ImportMetaEnv {
    readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
    readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
    /** D-79: where Send feedback goes. Unset in the smoke build, so the button reads Copy it. */
    readonly MAIN_VITE_FEEDBACK_EMAIL?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
