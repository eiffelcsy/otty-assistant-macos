import type { AnswerLanguage, HomeLanguage, QuickAction } from '../shared/types'
import { isMostlyHan } from '../shared/script'

// Which language each answer uses, and the prompt note that asks for it. No Electron imports, so it can be unit-tested.

export const LANGUAGE_NAMES: Record<AnswerLanguage, string> = {
  en: 'English',
  'zh-HK': 'Traditional Chinese as written in Hong Kong (繁體中文（香港）)'
}

/** The short label used in buttons: "Translate to 中文", "In 中文, please". */
export const LANGUAGE_SHORT: Record<AnswerLanguage, string> = { en: 'English', 'zh-HK': '中文' }

const HK_LOCALES = new Set(['zh-hk', 'zh-hant-hk', 'zh-mo', 'zh-hant-mo'])

/** zh-HK for Hong Kong and Macau Macs, otherwise none. Taiwan isn't defaulted in: HK vocabulary would feel off there. */
export function defaultHomeLanguage(systemLanguages: string[]): HomeLanguage | null {
  return systemLanguages.some((l) => HK_LOCALES.has(l.replace(/_/g, '-').toLowerCase())) ? 'zh-HK' : null
}

/** Translate goes the other way from the selection: English → home language, Chinese → English. */
export function translateTarget(selection: string, home: HomeLanguage): AnswerLanguage {
  return isMostlyHan(selection) ? 'en' : home
}

interface Turn {
  /** What the user typed (not the selection, not a chip label). */
  typed: string
  /** The pill's choice, or the "other language" button's. */
  picked?: AnswerLanguage
  action?: QuickAction
  /** The highlighted text, for Translate's direction. */
  selection?: string
  home: HomeLanguage | null
}

/** First rule that applies wins: an explicit pick, a language the action implies, what the user typed in, then English. */
export function resolveLanguage({ typed, picked, action, selection, home }: Turn): AnswerLanguage {
  if (picked) return picked
  if (!home) return 'en'
  if (action === 'explain-home') return home
  if (action === 'translate' && selection) return translateTarget(selection, home)
  if (action) return 'en'
  return isMostlyHan(typed) ? home : 'en'
}

const HK_BLOCK = `Answer language for THIS reply: ${LANGUAGE_NAMES['zh-HK']}.
- Write standard written Chinese (書面語) as used in Hong Kong. Not written Cantonese (no 係／唔／嘅／咗).
- Traditional characters only. Never use Simplified characters.
- Use Hong Kong vocabulary, not Taiwan or Mainland usage: 軟件 (not 軟體), 打印 (not 列印), 電郵 (not 電子郵件), 網上 (not 線上), 用戶 (not 使用者), 數據 (not 資料 for "data"), 伺服器, 檔案, 設定, 程式.
- Keep the screen's words in English: menu names, button labels, settings, code, commands, file names and error messages stay EXACTLY as shown, in 「」, with the Chinese meaning in （） the first time. Example: 按「File」（檔案）→「Print」（打印），然後選「Save as PDF」（另存為 PDF）。
- Explain-links stay in the same format: [詞語](#explain).`

/**
 * The per-turn note added to the end of the system prompt. Empty when the user has no home language and
 * nothing asked for another one, so English-only users get exactly today's prompt.
 */
export function languageBlock(language: AnswerLanguage, home: HomeLanguage | null): string {
  if (language === 'zh-HK') return HK_BLOCK
  if (!home) return ''
  return `Answer language for THIS reply: English, even if earlier replies in this chat were in another language.`
}
