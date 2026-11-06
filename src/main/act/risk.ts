import type { StepAction } from '../../shared/types'

// Steps that can't be undone with ⌘Z get a second click. This only ever adds a question, so a false alarm costs a click.

const RISKY = /\b(delete|erase|empty trash|empty bin|format|send|pay|purchase|buy|sign out|log ?out|reset|remove|uninstall|shut ?down|restart|factory)\b|刪除|删除|清空|格式化|發送|发送|付款|購買|购买|登出|重設|重置/i

/** ⌘Q and ⌘W lose work, and ⌘⌫ deletes. */
const RISKY_KEYS = /(⌘|command|cmd)[\s+⇧⌥⌃]*(shift\+|option\+)*(⌫|delete|backspace|q|w)$/i

export function isRisky(action: StepAction): boolean {
  if (action.kind === 'menu') return RISKY.test(action.path.join(' '))
  if (action.kind === 'keys') return RISKY_KEYS.test(action.combo) || RISKY.test(action.combo)
  return false
}
