import { useLayoutEffect, useRef } from 'react'
import { SLIDE_H, SLIDE_W } from '../../../shared/slides'

/**
 * One slide, scaled to fit its box. The page comes from `deckHtml`, which escapes every word the model wrote and
 * only ever embeds `data:` pictures, and it lives in a shadow root so its styles can't touch the app's.
 */
export function SlideView({ page, className = '' }: { page: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.innerHTML = page
  }, [page])

  useLayoutEffect(() => {
    const outer = box.current
    const inner = host.current
    if (!outer || !inner) return
    const fit = () => {
      const scale = Math.min(outer.clientWidth / SLIDE_W, outer.clientHeight / SLIDE_H) || 0
      inner.style.transform = `scale(${scale})`
      inner.style.left = `${(outer.clientWidth - SLIDE_W * scale) / 2}px`
      inner.style.top = `${(outer.clientHeight - SLIDE_H * scale) / 2}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={box} className={`slide-view ${className}`}>
      <div ref={host} className="slide-view__page" style={{ width: SLIDE_W, height: SLIDE_H }} />
    </div>
  )
}
