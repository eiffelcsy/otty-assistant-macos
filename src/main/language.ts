import type { AnswerLanguage, HomeLanguage, QuickAction } from '../shared/types'
import { isMostlyHan } from '../shared/script'

export { LANGUAGE_SHORT } from '../shared/languages'

// Which language each answer uses, and the prompt note that asks for it. No Electron imports, so it can be unit-tested.

export const LANGUAGE_NAMES: Record<AnswerLanguage, string> = {
  en: 'English',
  'zh-HK': 'Traditional Chinese as written in Hong Kong (繁體中文（香港）)'
}

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

const HK_GUIDE = `When asked to reply in ${LANGUAGE_NAMES['zh-HK']}:
- Write standard written Chinese (書面語) as used in Hong Kong. Not written Cantonese (no 係／唔／嘅／咗).
- Traditional characters only. Never use Simplified characters.
- Use Hong Kong vocabulary, not Taiwan or Mainland usage: 軟件 (not 軟體), 打印 (not 列印), 電郵 (not 電子郵件), 網上 (not 線上), 用戶 (not 使用者), 數據 (not 資料 for "data"), 伺服器, 檔案, 設定, 程式.
- Keep the screen's words in English: menu names, button labels, settings, code, commands, file names and error messages stay EXACTLY as shown, in 「」, with the Chinese meaning in （） the first time. Example: 按「File」（檔案）→「Print」（打印），然後選「Save as PDF」（另存為 PDF）。
- Explain-links stay in the same format: [詞語](#explain).`

/** The system prompt's language rules. They depend only on the setting, so the prompt stays the same from turn to turn. */
export function languageGuide(home: HomeLanguage | null): string {
  return home ? HK_GUIDE : ''
}

/**
 * One line saying which language to reply in. A note in the system prompt alone loses to the language of the question
 * itself: with 中 picked and the question typed in English, models reply in English. Empty for English-only users.
 */
export function languageReminder(language: AnswerLanguage, home: HomeLanguage | null): string {
  if (language === 'zh-HK')
    return `(Please reply in ${LANGUAGE_NAMES['zh-HK']}, even if I wrote in English. Keep on-screen English words as they are.)`
  if (!home) return ''
  return '(Please reply in English, even if earlier replies in this chat were in another language.)'
}

/** The time to the minute, with its zone. */
function clock(now: Date): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short', hour12: false }
  return `${now.toLocaleString('en-GB', options)} (UTC${offset(now)})`
}

function offset(now: Date): string {
  const minutes = -now.getTimezoneOffset()
  const abs = Math.abs(minutes)
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/**
 * What changes per turn: the time and the answer language. It goes at the end of the user's message and stays in the
 * history exactly as sent, because DeepSeek only reuses its cache for a request that repeats the last one byte for byte.
 * A Chinese reply with no home language set brings its guide along, since the system prompt doesn't have it.
 */
export function turnNote(language: AnswerLanguage, home: HomeLanguage | null, now = new Date()): string {
  const guide = language !== 'en' && !home ? HK_GUIDE : ''
  return [`[Current local time: ${clock(now)}]`, languageReminder(language, home), guide].filter(Boolean).join('\n')
}

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

/** `content` with `note` appended: to the text, or as a last text part for a message with a picture. */
export function withNote<C extends string | Part[]>(content: C, note: string): C {
  if (typeof content === 'string') return `${content}\n\n${note}` as C
  return [...content, { type: 'text', text: note }] as C
}
