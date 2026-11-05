import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { OcrLine, PickupPicture } from '../../../shared/types'
import { rowsOf, rowsText } from '../../../shared/readingOrder'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'

/** Slightly smaller than the box, which has room above and below the letters. */
const FONT_FIT = 0.86

/** The selected part of each line, keeping rows apart. Selected in the page, but built here so tables keep their tabs. */
function selectedText(layer: HTMLElement, rows: OcrLine[][]): string {
  const selection = getSelection()
  if (!selection?.rangeCount || selection.isCollapsed) return ''
  const range = selection.getRangeAt(0)
  const spans = layer.querySelectorAll<HTMLElement>('[data-line]')
  let i = 0
  const picked = rows.map((row) =>
    row.flatMap((line) => {
      const span = spans[i++]
      const text = span.firstChild
      if (!text || !range.intersectsNode(span)) return []
      const start = range.startContainer === text ? range.startOffset : 0
      const end = range.endContainer === text ? range.endOffset : line.text.length
      return start < end ? [line.text.slice(start, end)] : []
    })
  )
  return rowsText(picked.filter((row) => row.length))
}

/**
 * A picture with its words selectable, like text on a web page. Each line is invisible text laid exactly over the
 * words in the picture, and only the selection highlight shows. Nothing here is sent anywhere or saved.
 */
export function Pickup() {
  const [picture, setPicture] = useState<PickupPicture | null>(null)
  /** Undefined while reading, null if it failed. */
  const [lines, setLines] = useState<OcrLine[] | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const layer = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => rowsOf(lines ?? []), [lines])

  useEffect(() => {
    void window.otty.pickupPicture().then(setPicture)
    void window.otty.pickupRead().then(setLines)
  }, [])

  const copy = (text: string) => {
    if (!text) return
    void window.otty.copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const copyAll = () => copy(rowsText(rows.map((row) => row.map((l) => l.text))))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.otty.closePickup()
      if (!e.metaKey || !layer.current) return
      if (e.key === 'c') {
        e.preventDefault()
        copy(selectedText(layer.current, rows))
      }
      if (e.key === 'a') {
        e.preventDefault()
        getSelection()?.selectAllChildren(layer.current)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [rows])

  // Stretch each line to the width of its words in the picture, so a drag follows what the user sees.
  useLayoutEffect(() => {
    layer.current?.querySelectorAll<HTMLElement>('[data-line]').forEach((span) => {
      span.style.transform = ''
      const width = span.getBoundingClientRect().width
      const target = Number(span.dataset.width)
      if (width > 0) span.style.transform = `scaleX(${target / width})`
    })
  }, [rows, picture])

  const hint =
    lines === undefined
      ? 'Reading the words…'
      : lines === null
        ? 'Otty couldn’t read this picture.'
        : lines.length === 0
          ? 'Otty couldn’t find any words in this picture.'
          : 'Drag across the words, then press ⌘C.'

  return (
    <div className="pickup">
      {picture && (
        <div className="pickup__stage" style={{ width: picture.width, height: picture.height }}>
          <img src={picture.dataUrl} alt="" draggable={false} />
          <div className="pickup__text" ref={layer}>
            {rows.flat().map((line, i) => (
              <span
                key={i}
                data-line=""
                data-width={line.box.w * picture.width}
                style={{
                  left: line.box.x * picture.width,
                  top: line.box.y * picture.height,
                  height: line.box.h * picture.height,
                  lineHeight: `${line.box.h * picture.height}px`,
                  fontSize: line.box.h * picture.height * FONT_FIT
                }}
              >
                {line.text}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="pickup__bar">
        <Otter state={lines === undefined ? 'thinking' : 'idle'} size={30} />
        <span className="pickup__hint" role="status">
          {hint}
        </span>
        {!!lines?.length && (
          <button className="pickup__copy" onClick={copyAll}>
            <Icon name={copied ? 'check' : 'copy-alt'} />
            {copied ? 'Copied' : 'Copy all'}
          </button>
        )}
        <button className="pickup__close" title="Close (Esc)" aria-label="Close" onClick={() => void window.otty.closePickup()}>
          <Icon name="cross-small" />
        </button>
      </div>
    </div>
  )
}
