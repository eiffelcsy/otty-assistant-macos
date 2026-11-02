// Just enough of the zip format to add up how big an archive says it will be once unpacked,
// so a "zip bomb" .docx is refused before anything inflates it.

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

/** The total uncompressed size the archive's central directory declares. Throws if it isn't a zip. */
export function unzippedSize(buf: Buffer): number {
  // The end-of-central-directory record sits in the last 22 bytes, plus up to 64 KB of comment.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip')
  const entries = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  let total = 0
  for (let n = 0; n < entries; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL) throw new Error('bad central directory')
    const size = buf.readUInt32LE(at + 24)
    // 0xFFFFFFFF means a ZIP64 size we don't parse; treat it as too big.
    total += size === 0xffffffff ? Number.MAX_SAFE_INTEGER / 2 : size
    at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
  }
  return total
}
