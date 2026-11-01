import type { HomeLanguage, QuickAction, ScreenContext } from '../../../shared/types'
import { isMostlyHan, isShortPhrase } from '../../../shared/script'
import { Icon } from './Icon'

export interface ActionItem {
  action: QuickAction
  /** Shown on the tile and, once sent, as the user's message. */
  label: string
  icon: string
}

const HOME_SHORT: Record<HomeLanguage, string> = { 'zh-HK': '中文' }

/** The actions offered for this capture. The first one is what ↵ with an empty box does. */
export function actionsFor(ctx: ScreenContext, home: HomeLanguage | null): ActionItem[] {
  if (ctx.kind === 'image') {
    return [
      { action: 'what-is', label: 'What is this?', icon: 'eye' },
      { action: 'explain', label: 'Explain simply', icon: 'sparkles' },
      { action: 'read-text', label: 'Read the text', icon: 'text' },
      { action: 'next-step', label: 'What should I do?', icon: 'interrogation' }
    ]
  }
  const short = isShortPhrase(ctx.text)
  const translateTo = home && !isMostlyHan(ctx.text) ? HOME_SHORT[home] : 'English'
  return [
    ...(short ? [{ action: 'define' as const, label: 'What does it mean?', icon: 'book-open-cover' }] : []),
    { action: 'explain', label: 'Explain simply', icon: 'sparkles' },
    ...(home ? [{ action: 'explain-home' as const, label: `Explain in ${HOME_SHORT[home]}`, icon: 'comment-alt' }] : []),
    ...(short ? [] : [{ action: 'summarize' as const, label: 'Summarize', icon: 'list' }]),
    { action: 'translate', label: `Translate to ${translateTo}`, icon: 'language' },
    ...(short ? [] : [{ action: 'next-step' as const, label: 'What should I do?', icon: 'interrogation' }])
  ]
}

/** A tidy grid of action tiles under a capture. The first tile is the ↵ default and says so. */
export function QuickActions({
  items,
  disabled,
  onPick
}: {
  items: ActionItem[]
  disabled?: boolean
  onPick: (item: ActionItem) => void
}) {
  return (
    <div className="quick-actions">
      {items.map((a, i) => (
        <button key={a.action} className={`action${i === 0 ? ' action--default' : ''}`} disabled={disabled} onClick={() => onPick(a)}>
          <Icon name={a.icon} />
          <span className="action__label">{a.label}</span>
          {i === 0 && <kbd className="action__key">↵</kbd>}
        </button>
      ))}
    </div>
  )
}
