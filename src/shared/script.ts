// Script checks shared by main and renderer. Pure functions, no Electron or DOM.

const HAN = /\p{Script=Han}/gu
/** A run of non-Han letters: one English word. */
const WORD = /(?:(?!\p{Script=Han})\p{L})+/gu

/**
 * True when Han characters make up at least 30% of the text, counting each Han character and each other-script
 * word as one unit (a Han character is about a word). So "PDF 點樣 save?" counts as Chinese: Hong Kong users
 * often type English UI words into a Chinese question. Digits and punctuation don't count.
 */
export function isMostlyHan(text: string): boolean {
  const han = text.match(HAN)?.length ?? 0
  const units = han + (text.match(WORD)?.length ?? 0)
  return units > 0 && han / units >= 0.3
}

/** A word or short phrase (≤ 5 words, not Chinese): what "What does this mean?" is for. */
export function isShortPhrase(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 60 || isMostlyHan(t) || /\n/.test(t)) return false
  return t.split(/\s+/).length <= 5
}
