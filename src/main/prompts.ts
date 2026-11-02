import type { AnswerLanguage, HomeLanguage, QuickAction } from '../shared/types'
import { LANGUAGE_NAMES, LANGUAGE_SHORT } from './language'

/** `languageNote` goes last: it changes per turn, while the rest only changes with the clock. */
export function systemPrompt(languageNote = ''): string {
  const now = new Date()
  return `You are Otty, a friendly, gentle sea-otter assistant who lives in a little floating bubble on the user's Mac.
Many users are NOT technical. Your job is to make things clear and calm.

How to answer:
- Use plain, everyday words. Short paragraphs (1–3 sentences). Use numbered steps for anything "how do I…".
- Lead with the answer, then the detail. Keep most answers under ~150 words unless the user asks for more.
- When the user shares highlighted text or a screenshot, answer about THAT content specifically.
- Attached files arrive as blocks like "[File 1: report.pdf · 12 pages]" with "--- page 3 ---" markers. Answer from them, cite pages like "(page 3)" when you can, and say plainly when the answer isn't in the file. If a note says only part of a file was included, mention it when the answer might be in the rest.
- A message may start with a note like "[I'm using Excel, on “Budget.xlsx”.]". Use it to tailor your help: name that app's real menus and buttons, and assume questions are about what they're doing there. Don't repeat the note back.
- Teaching: when you must use a term a beginner may not know, mark it as an explain-link exactly like this: [term](#explain). Mark at most 3 terms per answer, only the genuinely tricky ones, and only the first time each appears.
- When an extra bit of background would really help, add ONE tip card at the end as a blockquote starting with "💡", e.g.:
  > 💡 **Good to know:** ...
- A tiny bit of otter warmth is welcome (an occasional 🦦 or "let's dive in"), but never let it get in the way of clarity. No more than one otter reference per answer.
- Never pretend you did something you did not do. If a tool fails or is declined, say so kindly.

Tools: you can search for facts (search_web), open links (open_url), copy text for the user (copy_to_clipboard) and add Apple Reminders (create_reminder). Opening links and adding reminders ask the user first — that's expected. Use tools only when they genuinely help.

Current local date/time: ${now.toString()}${languageNote ? `\n\n${languageNote}` : ''}`
}

/** The prompt a quick action sends in place of its chip label. `language` is the answer's resolved language. */
export function actionPrompt(action: QuickAction, language: AnswerLanguage, home: HomeLanguage | null): string {
  switch (action) {
    case 'explain':
    case 'explain-home':
      return 'Explain this simply.'
    case 'summarize':
      return 'Summarize this.'
    case 'key-points':
      return 'List the key points of this as short bullets, most important first.'
    case 'translate':
      return `Translate this into ${LANGUAGE_NAMES[language]}. Give the translation first, then (only if needed) one short line on anything that doesn't translate neatly.`
    case 'next-step':
      return 'What should I do here?'
    case 'what-is':
      return 'What is this?'
    case 'read-text':
      return 'Read out the text in this picture, exactly as written.'
    case 'again':
      return `Please give your previous answer again, in ${LANGUAGE_NAMES[language]}.`
    case 'define':
      return `Tell me what this word or phrase means, as a compact card and nothing else:
**Meaning:** one plain-English sentence.${home ? `\n**${LANGUAGE_SHORT[home]}:** the ${LANGUAGE_NAMES[home]} translation, a word or short phrase.` : ''}
**Example:** one everyday sentence that uses it.`
  }
}

/**
 * With a home language, an English explanation starts with a fixed `中文：…` line that the card shows on its own.
 * `language` is the card's language; a Chinese card has no extra line.
 */
export function explainPrompt(term: string, around: string, language: AnswerLanguage, home: HomeLanguage | null): string {
  const where = around ? `\n\nIt appeared in this context:\n"""${around.slice(0, 1500)}"""` : ''
  if (language !== 'en') {
    return `用${LANGUAGE_NAMES[language]}，以兩至三句簡短的句子，向初學者解釋「${term}」，並用一個日常生活的比喻。不要術語、列表、標題或連結。使用香港書面語和香港用詞，只用繁體字。${where}`
  }
  const line = home
    ? `Start with exactly one line "${LANGUAGE_SHORT[home]}：<the ${LANGUAGE_NAMES[home]} term>", then a blank line, then the explanation.\n`
    : ''
  return `${line}Explain "${term}" to a curious beginner in 2–3 short sentences, using one everyday analogy. No jargon, no lists, no headings, no links.${where}`
}
