import type { Plugin } from 'vite'

// Built pages only reach their own files, so nothing in an answer can call out to another server.
// Build-only because Vite's dev server needs inline scripts and a socket.
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

export const contentSecurityPolicy: Plugin = {
  name: 'otty-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }
  ]
}
