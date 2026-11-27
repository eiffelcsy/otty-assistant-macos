// Tooltips (DESIGN.md, "Tooltip"; W11): every `title` in a window shows as Otty's own tooltip, not the system's. The
// first one waits 500 ms; for 1.5 s after one closes the next is instant, so moving along the header scans quickly.
// The title moves to `data-title` while it shows (or the system's would show too) and comes back when it hides. An
// element named only by its title borrows it as `aria-label` meanwhile, so it keeps its name, and gives it back after.
// `data-keys` (D-85) adds the action's shortcut after its name, as a quieter keycap.

export const DELAY_MS = 500
export const WARM_MS = 1500
const GAP = 6

export function installTooltips(doc: Document = document): () => void {
  const tip = doc.createElement('div')
  tip.className = 'tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  doc.body.append(tip)
  let target: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let warmUntil = 0

  const show = () => {
    if (!target) return
    tip.textContent = target.dataset.title ?? ''
    if (target.dataset.keys) {
      const keys = doc.createElement('span')
      keys.className = 'tooltip__keys'
      keys.textContent = target.dataset.keys
      tip.append(keys)
    }
    tip.hidden = false
    const r = target.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const vw = doc.documentElement.clientWidth
    const below = r.bottom + GAP + t.height <= doc.documentElement.clientHeight
    tip.style.left = `${Math.max(GAP, Math.min(vw - t.width - GAP, r.left + r.width / 2 - t.width / 2))}px`
    tip.style.top = `${below ? r.bottom + GAP : r.top - GAP - t.height}px`
  }
  const hide = () => {
    clearTimeout(timer)
    if (target) {
      if (!target.hasAttribute('title') && target.dataset.title) target.setAttribute('title', target.dataset.title)
      if ('lent' in target.dataset) target.removeAttribute('aria-label')
      delete target.dataset.title
      delete target.dataset.lent
      if (!tip.hidden) warmUntil = Date.now() + WARM_MS
    }
    target = null
    tip.hidden = true
  }
  const over = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title]')
    if (!el || el === target) return
    hide()
    const title = el.getAttribute('title')
    if (!title) return
    target = el
    el.dataset.title = title
    el.removeAttribute('title')
    if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) {
      el.setAttribute('aria-label', title)
      el.dataset.lent = ''
    }
    timer = setTimeout(show, Date.now() < warmUntil ? 0 : DELAY_MS)
  }
  const out = (e: Event) => {
    if (target && !target.contains((e as MouseEvent).relatedTarget as Node | null)) hide()
  }

  doc.addEventListener('mouseover', over)
  doc.addEventListener('mouseout', out)
  doc.addEventListener('pointerdown', hide, true)
  doc.addEventListener('keydown', hide, true)
  return () => {
    hide()
    tip.remove()
    doc.removeEventListener('mouseover', over)
    doc.removeEventListener('mouseout', out)
    doc.removeEventListener('pointerdown', hide, true)
    doc.removeEventListener('keydown', hide, true)
  }
}
