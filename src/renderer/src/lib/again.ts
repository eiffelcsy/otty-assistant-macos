import type { AnswerLanguage, HomeLanguage } from '../../../shared/types'
import { LANGUAGE_SHORT } from '../../../shared/languages'
import type { AgainOffer } from '../panel/Messages'
import type { UiMessage } from './useChat'

/** The "other language" button for the latest finished answer, or nothing. Answers saved before D-2 count as English. */
export function againOffer(messages: UiMessage[], home: HomeLanguage | null, busy: boolean): { id: string; offer: AgainOffer } | null {
  const last = messages[messages.length - 1]
  if (!home || busy || last?.role !== 'assistant' || last.streaming || last.error || !last.text) return null
  const target: AnswerLanguage = (last.language ?? 'en') === home ? 'en' : home
  const text = `In ${LANGUAGE_SHORT[target]}, please`
  return {
    id: last.id,
    offer: {
      label: `In ${LANGUAGE_SHORT[target]}`,
      onClick: () => window.otty.sendMessage(text, null, { language: target, action: 'again' })
    }
  }
}
