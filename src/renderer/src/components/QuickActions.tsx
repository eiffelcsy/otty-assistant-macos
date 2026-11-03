import type { Capture, FileAttachment, HomeLanguage, QuickAction, ScreenContext } from '../../../shared/types'
import { LANGUAGE_SHORT } from '../../../shared/languages'
import { isMostlyHan, isShortPhrase } from '../../../shared/script'
import { Icon } from './Icon'

export interface ActionItem {
  action: QuickAction
  /** Shown on the tile and, once sent, as the user's message. */
  label: string
  icon: string
}

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
  const translateTo = home && !isMostlyHan(ctx.text) ? LANGUAGE_SHORT[home] : 'English'
  return [
    ...(short ? [{ action: 'define' as const, label: 'What does it mean?', icon: 'book-open-cover' }] : []),
    { action: 'explain', label: 'Explain simply', icon: 'sparkles' },
    ...(home ? [{ action: 'explain-home' as const, label: `Explain in ${LANGUAGE_SHORT[home]}`, icon: 'comment-alt' }] : []),
    ...(short ? [] : [{ action: 'summarize' as const, label: 'Summarize', icon: 'list' }]),
    { action: 'translate', label: `Translate to ${translateTo}`, icon: 'language' },
    ...(short ? [] : [{ action: 'next-step' as const, label: 'What should I do?', icon: 'interrogation' }])
  ]
}

/** The actions offered for attached files, when there's no capture. */
export function actionsForFiles(files: FileAttachment[]): ActionItem[] {
  if (files.every((f) => f.kind === 'image')) {
    return [
      { action: 'what-is', label: 'What is this?', icon: 'eye' },
      { action: 'explain', label: 'Explain simply', icon: 'sparkles' },
      { action: 'read-text', label: 'Read the text', icon: 'text' }
    ]
  }
  return [
    { action: 'summarize', label: 'Summarize', icon: 'list' },
    { action: 'key-points', label: 'Key points', icon: 'list-check' },
    { action: 'explain', label: 'Explain simply', icon: 'sparkles' }
  ]
}

/** The actions for everything in the tray. Several things together get Compare (the ↵ default) and friends. */
export function actionsForTray(captures: Capture[], files: FileAttachment[], home: HomeLanguage | null): ActionItem[] {
  if (captures.length + files.length > 1 && captures.length > 0) {
    return [
      { action: 'compare', label: 'Compare these', icon: 'balance-scale-left' },
      { action: 'summarize-all', label: 'Summarize all', icon: 'list' },
      { action: 'explain-each', label: 'Explain each', icon: 'sparkles' }
    ]
  }
  if (captures.length === 1) return actionsFor(captures[0].context, home)
  return files.length ? actionsForFiles(files) : []
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
