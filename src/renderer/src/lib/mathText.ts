/**
 * Models sometimes write `$x^2$` or put a ✓ inside a formula, though only `$$…$$` is math here. This puts both right
 * before rendering, so a good answer isn't shown as raw symbols. Prices stay text: a single-dollar pair only counts when
 * it has no space inside its edges, isn't followed by a digit, and looks like a formula.
 */

const LOOKS_LIKE_MATH = /[\\^_=]|^[A-Za-z]$/
// Pandoc's rule: a non-space right after the opening $, and right before the closing one.
const SINGLE = /(?<![\\$])\$(?![\s$])([^$\n]*?[^\s$\\])\$(?![\d$])/g

function fixInside(math: string): string {
  return math.replace(/\\?[✓✔]/g, '\\checkmark ').replace(/\\?[✗✘]/g, '\\times ')
}

function fixPlain(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => `$$${fixInside(inner)}$$`)
    .replace(SINGLE, (whole, inner: string) => (LOOKS_LIKE_MATH.test(inner) ? `$$${fixInside(inner)}$$` : whole))
}

/** Leaves code (fenced or inline) alone. */
export function tidyMath(text: string): string {
  if (!text.includes('$')) return text
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : fixPlain(part)))
    .join('')
}
