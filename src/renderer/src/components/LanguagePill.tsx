import type { AnswerLanguage, HomeLanguage } from '../../../shared/types'
import { LANGUAGE_SHORT, LANGUAGE_TAG } from '../../../shared/languages'

/**
 * EN / 中 for the next message only. Neither pressed = Auto (Otty answers in the language you type).
 * Pressing the lit one again goes back to Auto. The parent resets it after each send.
 */
export function LanguagePill({
  home,
  value,
  onChange,
  disabled
}: {
  home: HomeLanguage
  value: AnswerLanguage | undefined
  onChange: (v: AnswerLanguage | undefined) => void
  disabled?: boolean
}) {
  const options: AnswerLanguage[] = ['en', home]
  return (
    <div className={`lang-pill${value ? ' lang-pill--set' : ''}`} role="group" aria-label="Answer language for this message">
      {options.map((l) => (
        <button
          key={l}
          type="button"
          className="lang-pill__opt"
          aria-pressed={value === l}
          disabled={disabled}
          title={value === l ? 'Back to Auto: answer in the language I type' : `Answer this message in ${LANGUAGE_SHORT[l]}`}
          onClick={() => onChange(value === l ? undefined : l)}
        >
          {LANGUAGE_TAG[l]}
        </button>
      ))}
    </div>
  )
}
