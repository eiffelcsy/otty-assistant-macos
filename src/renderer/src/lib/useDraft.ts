import { useEffect, useMemo, useRef } from 'react'

/**
 * Saves the box's words to main as the user types, 300 ms after they pause (D-62). `flush` saves now, before the
 * user moves to another chat or window; `drop` forgets a pending save, once the words have been sent.
 */
export function useDraft() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return useMemo(
    () => ({
      save(text: string) {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => window.otty.setDraft(text), 300)
      },
      flush(text: string) {
        clearTimeout(timer.current)
        window.otty.setDraft(text)
      },
      drop() {
        clearTimeout(timer.current)
      }
    }),
    []
  )
}
