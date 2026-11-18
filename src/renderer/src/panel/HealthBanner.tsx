import { useEffect, useState } from 'react'
import type { CapStatus, Permissions, PublicSettings } from '../../../shared/types'
import { healthProblem } from '../../../shared/health'
import { capPassed } from '../../../shared/cap'
import { Icon } from '../components/Icon'
import { prettyKey } from '../lib/keys'

/**
 * Looks again whenever the panel comes back into view, so allowing something in System Settings clears it, and the
 * monthly limit again when an answer or a look finishes, since that's what passes it while the panel stays open.
 * No polling.
 */
function useHealth(): { perms: Permissions | null; cap: CapStatus | null } {
  const [perms, setPerms] = useState<Permissions | null>(null)
  const [cap, setCap] = useState<CapStatus | null>(null)
  useEffect(() => {
    const checkCap = () => void window.otty.getUsage().then((u) => setCap(u.cap ?? null))
    const check = () => {
      void window.otty.getPermissions().then(setPerms)
      checkCap()
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    const offChat = window.otty.onChatEvent((e) => {
      if (e.type === 'done') checkCap()
    })
    const offActivity = window.otty.onActivity(checkCap)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
      offChat()
      offActivity()
    }
  }, [])
  return { perms, cap }
}

/** One quiet 40px line at the top of the chat when something the user will try won't work yet, with the fix one tap away. A click on the words unfolds them. */
export function HealthBanner({ settings, onOpenSettings }: { settings: PublicSettings; onOpenSettings: () => void }) {
  const { perms, cap } = useHealth()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const problem = healthProblem(perms, settings, cap)
  if (!problem) return null
  const id = problem.kind === 'hotkey' ? `hotkey:${problem.hotkey}` : problem.kind
  if (dismissed === id) return null

  const text =
    problem.kind === 'accessibility'
      ? `${prettyKey(settings.askHotkey)} can’t read highlighted text until Otty is allowed under Accessibility.`
      : problem.kind === 'screen'
        ? 'Snips can only see your wallpaper. Allow Screen Recording, then reopen Otty.'
        : problem.kind === 'cap'
          ? capPassed(problem.cap)
          : `Another app uses ${prettyKey(problem.hotkey)}, so it won’t work for ${problem.what}.`

  return (
    <div className={`health${open ? ' health--open' : ''}`} role="status">
      <Icon name="triangle-warning" />
      <button className="health__text" title={open ? undefined : text} aria-expanded={open} onClick={() => setOpen(!open)}>
        {text}
      </button>
      <span className="health__actions">
        {problem.kind === 'hotkey' || problem.kind === 'cap' ? (
          <button className="btn btn--primary btn--small" onClick={onOpenSettings}>
            {problem.kind === 'cap' ? 'Change the limit' : 'Change it'}
          </button>
        ) : (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.openPermissionSettings(problem.kind as 'accessibility' | 'screen')}>
            Allow
          </button>
        )}
        {problem.kind === 'screen' && (
          <button className="btn btn--soft btn--small" onClick={() => void window.otty.relaunch()}>
            Reopen Otty
          </button>
        )}
        <button className="icon-btn icon-btn--sm" title="Not now" onClick={() => setDismissed(id)}>
          <Icon name="cross-small" />
        </button>
      </span>
    </div>
  )
}
