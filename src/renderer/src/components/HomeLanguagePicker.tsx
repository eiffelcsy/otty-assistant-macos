import type { HomeLanguage } from '../../../shared/types'

const OPTIONS: { value: HomeLanguage | null; title: string; hint: string }[] = [
  { value: null, title: 'English only', hint: 'Otty always answers in English.' },
  {
    value: 'zh-HK',
    title: '繁體中文（香港）',
    hint: 'Answers stay in English, but you can ask in Chinese or tap 中 to get Chinese. Words on your screen stay in English.'
  }
]

/** "My other language": radio rows, used in Settings and on the welcome page. */
export function HomeLanguagePicker({ value, onChange }: { value: HomeLanguage | null; onChange: (v: HomeLanguage | null) => void }) {
  return (
    <div className="choices" role="radiogroup" aria-label="My other language">
      {OPTIONS.map((o) => (
        <label key={o.value ?? 'none'} className={`choice${value === o.value ? ' choice--on' : ''}`}>
          <input type="radio" name="home-language" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="choice__text">
            <b>{o.title}</b>
            <span>{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
