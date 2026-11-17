import { useState } from 'react'
import type { FileAttachment, FileKind } from '../../../shared/types'
import type { Chip } from '../lib/useAttachments'
import { HiddenSheet } from './HiddenSheet'
import { Icon } from './Icon'

const ICON: Record<FileKind, string> = {
  pdf: 'file-pdf',
  docx: 'file-word',
  doc: 'document',
  image: 'picture',
  text: 'document',
  code: 'file-code',
  notebook: 'notebook'
}
const KIND: Record<FileKind, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  doc: 'Document',
  image: 'Picture',
  text: 'Text',
  code: 'Code',
  notebook: 'Notebook'
}

const count = (n: number, word: string) => `${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`

/** "12 pages", "Python · 240 lines", "Notebook · 18 cells", with "· 2 keys hidden" when Otty hid any. */
export function detail(f: FileAttachment): string {
  const what =
    f.pages ? count(f.pages, 'page')
    : f.kind === 'code' && f.lines ? `${f.lang ?? 'Code'} · ${count(f.lines, 'line')}`
    : f.kind === 'notebook' && f.cells ? `Notebook · ${count(f.cells, 'cell')}`
    : KIND[f.kind]
  return f.hidden ? `${what} · ${f.hidden === 1 ? '1 key' : `${f.hidden} keys`} hidden` : what
}

/** Shown under the chip when something was hidden before sending. */
export function hiddenNote(f: FileAttachment): string | null {
  if (!f.hidden) return null
  return `Otty hid ${f.hidden === 1 ? '1 thing' : `${f.hidden} things`} that looked like keys or passwords`
}

function titleOf(name: string, f?: FileAttachment): string {
  const note = f && hiddenNote(f)
  return note ? `${name}\n${note} before sending.` : name
}

function Thumb({ file }: { file?: FileAttachment }) {
  if (file?.thumb) return <img className="file-chip__thumb" src={file.thumb} alt="" />
  return (
    <span className="file-chip__icon">
      <Icon name={file ? ICON[file.kind] : 'document'} />
    </span>
  )
}

/** The files waiting to go with the next message. */
export function FileTray({ chips, onRemove }: { chips: Chip[]; onRemove: (id: string) => void }) {
  return (
    <div className="file-tray">
      {chips.map((c) => (
        <div key={c.id} className={`file-chip file-chip--${c.state}`} title={c.message ?? titleOf(c.name, c.file)}>
          {c.state === 'error' ? (
            <span className="file-chip__icon">
              <Icon name="triangle-warning" />
            </span>
          ) : (
            <Thumb file={c.file} />
          )}
          <span className="file-chip__text">
            <span className="file-chip__name">{c.name}</span>
            <span className="file-chip__detail">
              {c.state === 'reading' ? <span className="dots">Reading</span> : c.state === 'error' ? c.message : detail(c.file!)}
            </span>
          </span>
          <button className="file-chip__x" title="Remove" onClick={() => onRemove(c.id)}>
            <Icon name="cross-small" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** The files sent with a message, with a note when only part of one was read. */
export function FileList({ files }: { files: FileAttachment[] }) {
  return (
    <div className="file-tray file-tray--sent">
      {files.map((f) => (
        <div key={f.id} className="file-chip" title={titleOf(f.name, f)}>
          <Thumb file={f} />
          <span className="file-chip__text">
            <span className="file-chip__name">{f.name}</span>
            <span className="file-chip__detail">{f.note ?? detail(f)}</span>
          </span>
        </div>
      ))}
      {files.map((f) => (
        <FileHidden key={f.id} file={f} />
      ))}
    </div>
  )
}

/** "budget.csv: 2 keys hidden", tapped to see which lines (D-40). */
function FileHidden({ file }: { file: FileAttachment }) {
  const [open, setOpen] = useState(false)
  if (!file.hidden) return null
  return (
    <div className="file-hidden">
      <button className="hidden-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="shield-check" />
        <span>
          {file.name}: {file.hidden === 1 ? '1 key' : `${file.hidden} keys`} hidden
        </span>
      </button>
      {open && <HiddenSheet id={file.id} />}
    </div>
  )
}
