import type { ConnectRequest } from '../../shared/types'
import * as links from '../connections'
import { handle } from './check'

// D-54: Settings › Connections and the chat's connection card. The work is in `connections/`; this only routes.
export function registerConnections(): void {
  handle('connections:list', () => links.connectionsState())
  handle('connections:connect', (_e, req: ConnectRequest) => links.connect(req))
  handle('connections:cancel', () => {
    links.cancelConnect()
  })
  handle('connections:tool', (_e, id: string, tool: string, on: boolean) => links.setTool(id, tool, on))
  handle('connections:recheck', (_e, id: string) => links.recheck(id))
  handle('connections:sign-in', (_e, id: string) => links.signInAgain(id))
  handle('connections:remove', (_e, id: string) => links.removeConnection(id))
}
