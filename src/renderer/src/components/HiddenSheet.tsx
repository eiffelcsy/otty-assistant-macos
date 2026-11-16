import { useEffect, useState } from 'react'

/**
 * Which lines Otty hid something in (D-40), each value cut to a hint, fetched from main when asked. They're kept on
 * the Mac only, and only until Otty restarts.
 */
export function HiddenSheet({ id }: { id: string }) {
  const [lines, setLines] = useState<string[] | null | undefined>(undefined)
  useEffect(() => {
    void window.otty.hiddenLines(id).then(setLines)
  }, [id])
  if (lines === undefined) return null
  return (
    <div className="hidden-sheet" role="note">
      {lines ? (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>
              <code>{l}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>Otty doesn’t keep these once it restarts, so it can’t show them now.</p>
      )}
      <p className="hint">If one wasn’t a key, type it into your message yourself to send it.</p>
    </div>
  )
}
