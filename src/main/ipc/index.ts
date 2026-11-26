import { registerActivity } from './activity'
import { registerChat } from './chat'
import { registerCalendar } from './calendar'
import { registerConnections } from './connections'
import { registerSettings } from './settings'
import { registerWindows } from './windows'

/** Every channel, each checked against `CHANNELS` in `check.ts` before its handler runs (D-44). */
export function registerIpc(): void {
  registerSettings()
  registerChat()
  registerActivity()
  registerConnections()
  registerCalendar()
  registerWindows()
}
