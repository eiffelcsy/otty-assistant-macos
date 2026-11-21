import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Bubble } from './bubble/Bubble'
import { Panel } from './panel/Panel'
import { Pickup } from './pickup/Pickup'
import { Quick } from './quick/Quick'
import { Viewer } from './viewer/Viewer'
import { installTooltips } from './lib/tooltips'
import { MotionRoot } from './lib/motion'
import { coveGlass, coveTime, untilNextCove } from './lib/cove'
import './styles.css'

const view = new URLSearchParams(location.search).get('view') ?? 'panel'
document.documentElement.dataset.view = view

// The bubble's window is the otter's size, too small for a tooltip of Otty's own.
if (view !== 'bubble') installTooltips()

/** Spec 08: every window takes the hour's mist from the cove's clock (`data-time`, `data-glass` on the root). One timer. */
function followHour(): void {
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
  const set = () => {
    const time = coveTime(new Date())
    document.documentElement.dataset.time = time
    document.documentElement.dataset.glass = coveGlass(time, dark?.matches ?? false)
  }
  const tick = () => {
    set()
    setTimeout(tick, untilNextCove(new Date()))
  }
  tick()
  dark?.addEventListener('change', set)
}
if (view !== 'bubble') followHour()

window.otty.onWindowVisible((visible) => document.documentElement.toggleAttribute('data-asleep', !visible))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      {view === 'bubble' ? <Bubble /> : view === 'quick' ? <Quick /> : view === 'pickup' ? <Pickup /> : view === 'viewer' ? <Viewer /> : <Panel />}
    </MotionRoot>
  </StrictMode>
)
