import type { AnswerLanguage } from './types'

/** The short label used in buttons and pills: "Translate to 中文", "Answer in English". */
export const LANGUAGE_SHORT: Record<AnswerLanguage, string> = { en: 'English', 'zh-HK': '中文' }

/** The pill's compact label. */
export const LANGUAGE_TAG: Record<AnswerLanguage, string> = { en: 'EN', 'zh-HK': '中' }
