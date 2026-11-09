import { useEffect, useState } from 'react'
import type { Permissions, PublicSettings } from '../../../shared/types'
import { healthProblem } from '../../../shared/health'
import { Icon } from '../components/Icon'
import { prettyKey } from '../lib/keys'

/** Looks again whenever the panel comes back into view, so allowing something in System Settings clears it. No polling. */
function usePermissions(): Permissions | null {
  const [perms, setPerms] = useState<Permissions | null>(null)
  useEffect(() => {
    const check = () => void window.otty.getPermissions().then(setPerms)
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return perms
}

/** One quiet line at the top of the chat when something the user will try won't work yet, with the fix one tap away. */
export function HealthBanner({ settings, onOpenSettings }: { settings: PublicSettings; onOpenSettings: () => void }) {
  const perms = usePermissions()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const problem = healthProblem(perms, settings)
  if (!problem) return null
  const id = problem.kind === 'hotkey' ? `hotkey:${problem.hotkey}` : problem.kind
  if (dismissed === id) return null

  const text =
    problem.kind === 'accessibility'
      ? `Highlighting won’t work yet: ${prettyKey(settings.askHotkey)} needs Otty to be allowed under Accessibility.`
      : problem.kind === 'screen'
        ? 'Snips only show your wallpaper until Otty is allowed under Screen Recording. If you just allowed it, reopen Otty.'
        : `${prettyKey(problem.hotkey)} belongs to another app, so ${problem.what} won’t work with it.`

  return (
    <div className="health" role="status">
      <Icon name="triangle-warning" />
      <span className="health__text">{text}</span>
      <span className="health__actions">
        {problem.kind === 'hotkey' ? (
          <button className="btn btn--primary btn--small" onClick={onOpenSettings}>
            Change it
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
        <button className="health__close" title="Not now" onClick={() => setDismissed(id)}>
          <Icon name="cross-small" />
        </button>
      </span>
    </div>
  )
}
