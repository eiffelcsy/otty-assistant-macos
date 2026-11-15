import DOMPurify from 'dompurify'

// Belt and braces for drawings (D-30). They're shown as `<img src="data:…">`, where an SVG can't run scripts or
// fetch anything, and exported in a window with JavaScript off and the network cut. This also strips anything
// active or remote from the SVG itself, so a drawing stays harmless wherever it ends up (a file, the clipboard).

/** A reference to something inside the same SVG: `#id`. Anything else is a way out. */
const LOCAL_REF = /^\s*#/

/** In `<style>` and `style=""`: `@import` and any `url()` that isn't `#local` or a `data:` picture. */
function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (all, _q, target: string) => (/^#|^data:image\//i.test(target.trim()) ? all : 'none'))
    .replace(/expression\s*\(/gi, '(')
}

let hooked = false
function hook(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = data.attrName.toLowerCase()
    if ((name === 'href' || name === 'xlink:href' || name === 'src') && !LOCAL_REF.test(data.attrValue)) data.keepAttr = false
    if (name === 'style') data.attrValue = cleanCss(data.attrValue)
  })
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && node.textContent) node.textContent = cleanCss(node.textContent)
  })
}

/** The SVG with scripts, event handlers, HTML islands, links and remote references removed, or null if it isn't one. */
export function sanitizeSvg(svg: string): string | null {
  hook()
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['foreignObject', 'script', 'a', 'iframe', 'object', 'embed', 'image', 'animate', 'set', 'animateMotion', 'animateTransform'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onbegin', 'onend', 'onmouseover'],
    WHOLE_DOCUMENT: false
  })
  const trimmed = clean.trim()
  if (!/^<svg[\s>]/i.test(trimmed)) return null
  // An SVG shown as a picture needs its namespace.
  return /xmlns=/.test(trimmed.slice(0, trimmed.indexOf('>'))) ? trimmed : trimmed.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
}

/** The size an SVG asks for: its viewBox, else its width and height, else a sensible default. */
export function svgSize(svg: string): { width: number; height: number } {
  const head = svg.slice(0, svg.indexOf('>') + 1)
  const box = head.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (box) return { width: Math.round(Number(box[1])) || 800, height: Math.round(Number(box[2])) || 600 }
  const w = head.match(/\swidth\s*=\s*["']?([\d.]+)/i)
  const h = head.match(/\sheight\s*=\s*["']?([\d.]+)/i)
  return { width: Math.round(Number(w?.[1])) || 800, height: Math.round(Number(h?.[1])) || 600 }
}
