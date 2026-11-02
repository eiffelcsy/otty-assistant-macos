import { readFileSync } from 'fs'
import { join } from 'path'
import { deflateRawSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { cutToTokens, estimateTokens, fitDocument, fitFiles, shareBudget } from '../budget'
import { decodeText, extract, FileError, kindOf } from '../extract'
import { unzippedSize } from '../zip'

const fixture = (name: string) => join(__dirname, 'fixtures', name)

describe('kindOf', () => {
  it('knows documents, pictures and text by extension', () => {
    expect(kindOf('Report.PDF')).toBe('pdf')
    expect(kindOf('lease.docx')).toBe('docx')
    expect(kindOf('IMG_0042.HEIC')).toBe('image')
    expect(kindOf('budget.csv')).toBe('text')
    expect(kindOf('old.doc')).toBeNull()
    expect(kindOf('Otty.app')).toBeNull()
    expect(kindOf('README')).toBeNull()
  })
})

describe('extract', () => {
  it('reads a PDF page by page', async () => {
    expect(await extract(fixture('two-pages.pdf'), 'pdf')).toEqual({
      kind: 'pdf',
      pages: ['Otters hold hands while they sleep.', 'Page two talks about rafts.']
    })
  })

  it('turns away a scanned PDF kindly', async () => {
    await expect(extract(fixture('scan.pdf'), 'pdf')).rejects.toThrow(/scan/)
  })

  it('turns away a damaged PDF kindly', async () => {
    await expect(extract(fixture('lease.docx'), 'pdf')).rejects.toBeInstanceOf(FileError)
  })

  it('reads a Word document, headings and Chinese included', async () => {
    const doc = await extract(fixture('lease.docx'), 'docx')
    expect(doc).toEqual({ kind: 'docx', text: 'Clause 4\n\nThe tenant must give one month of notice.\n\n租客須提前一個月通知。' })
  })

  it('reads UTF-8 text', async () => {
    expect(await extract(fixture('notes-zh.txt'), 'text')).toEqual({ kind: 'text', text: '打印之前，請先儲存檔案。\nSave before you print.' })
  })
})

describe('decodeText', () => {
  it('drops a BOM and refuses binary or empty files', () => {
    expect(decodeText(Buffer.from('﻿hello'))).toBe('hello')
    expect(() => decodeText(Buffer.from([0x50, 0x4b, 0x00, 0x01]))).toThrow(/text file/)
    expect(() => decodeText(Buffer.from('  \n'))).toThrow(/empty/)
  })
})

describe('unzippedSize', () => {
  it('adds up what the archive says it unpacks to', () => {
    expect(unzippedSize(readFileSync(fixture('lease.docx')))).toBeGreaterThan(500)
  })

  it('sees through a small zip that would unpack to something huge', () => {
    expect(unzippedSize(zipOf('bomb.xml', Buffer.alloc(50_000_000)))).toBe(50_000_000)
  })

  it('throws for something that isn’t a zip', () => {
    expect(() => unzippedSize(Buffer.from('not a zip at all, just some text that is long enough'))).toThrow()
  })
})

describe('budget', () => {
  it('counts CJK characters as whole tokens', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('打印')).toBe(2)
    expect(cutToTokens('打印之前abcd', 3)).toBe('打印之')
  })

  it('gives small files all they need and splits the rest', () => {
    expect(shareBudget([10, 1000, 1000], 610)).toEqual([10, 300, 300])
    expect(shareBudget([10, 20], 1000)).toEqual([10, 20])
  })

  it('keeps whole pages and says how many were read', () => {
    const pages = Array.from({ length: 120 }, (_, i) => `Page ${i + 1} `.repeat(40))
    const fitted = fitDocument(1, 'report.pdf', { kind: 'pdf', pages }, 4000)
    expect(fitted.note).toMatch(/^Otty read the first \d+ of 120 pages\.$/)
    const read = Number(fitted.note!.match(/first (\d+)/)![1])
    expect(fitted.block).toContain(`--- page ${read} ---`)
    expect(fitted.block).not.toContain(`--- page ${read + 1} ---`)
    expect(fitted.block.startsWith('[File 1: report.pdf · 120 pages]')).toBe(true)
  })

  it('sends a short document whole, without a note', () => {
    const fitted = fitDocument(2, 'lease.docx', { kind: 'docx', text: 'Clause 4' }, 1000)
    expect(fitted).toEqual({ block: '[File 2: lease.docx]\nClause 4\n[End of file 2]' })
  })

  it('numbers files and labels pictures', () => {
    const out = fitFiles([
      { name: 'photo.jpg', image: 'data:image/jpeg;base64,AAAA' },
      { name: 'notes.txt', doc: { kind: 'text', text: 'hello' } }
    ])
    expect(out[0]).toEqual({ text: '[File 1: photo.jpg · a picture, attached]', image: 'data:image/jpeg;base64,AAAA' })
    expect(out[1].text).toBe('[File 2: notes.txt]\nhello\n[End of file 2]')
  })
})

/** A one-entry zip, deflated, so it stays small on disk. */
function zipOf(name: string, data: Buffer): Buffer {
  const packed = deflateRawSync(data)
  const nameBuf = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(packed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(packed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  const centralAt = 30 + nameBuf.length + packed.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(46 + nameBuf.length, 12)
  end.writeUInt32LE(centralAt, 16)
  return Buffer.concat([local, nameBuf, packed, central, nameBuf, end])
}
