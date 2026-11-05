import type { OcrLine } from './types'

const centre = (l: OcrLine) => l.box.y + l.box.h / 2

/**
 * Lines grouped into rows, top to bottom and left to right. Vision reads a table column by column,
 * which would make a drag across a row select the wrong words.
 */
export function rowsOf(lines: OcrLine[]): OcrLine[][] {
  const rows: OcrLine[][] = []
  for (const line of [...lines].sort((a, b) => centre(a) - centre(b))) {
    const row = rows.at(-1)
    const same = row && Math.abs(centre(line) - centre(row[0])) < Math.min(line.box.h, row[0].box.h) / 2
    if (same) row.push(line)
    else rows.push([line])
  }
  return rows.map((row) => row.sort((a, b) => a.box.x - b.box.x))
}

/** Tabs between the cells of a row, so a copied table lands in Word and spreadsheets as cells. */
export function rowsText(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n')
}
