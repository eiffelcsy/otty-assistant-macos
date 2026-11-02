import type { FileAttachment, FileKind } from '../../../shared/types'
import type { Chip } from '../lib/useAttachments'
import { Icon } from './Icon'

const ICON: Record<FileKind, string> = { pdf: 'file-pdf', docx: 'file-word', image: 'picture', text: 'document' }
const KIND: Record<FileKind, string> = { pdf: 'PDF', docx: 'Word document', image: 'Picture', text: 'Text' }

function detail(f: FileAttachment): string {
  if (f.pages) return `${f.pages} page${f.pages === 1 ? '' : 's'}`
  return KIND[f.kind]
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
        <div key={c.id} className={`file-chip file-chip--${c.state}`} title={c.message ?? c.name}>
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
        <div key={f.id} className="file-chip" title={f.name}>
          <Thumb file={f} />
          <span className="file-chip__text">
            <span className="file-chip__name">{f.name}</span>
            <span className="file-chip__detail">{f.note ?? detail(f)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
