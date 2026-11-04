import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

/** What goes on the clipboard. `html` is only there when the text holds a table. */
export interface CopyFormats {
  text: string
  html?: string
}

/** The loose shape shared by Markdown and HTML trees, enough to walk and rewrite them. */
interface Node {
  type: string
  tagName?: string
  value?: string
  url?: string
  alt?: string
  children?: Node[]
  properties?: Record<string, unknown>
  position?: { start: { offset?: number }; end: { offset?: number } }
}

const parser = unified().use(remarkParse).use(remarkGfm)
const toHtml = unified().use(remarkRehype).use(rehypeStringify)

const SAFE_LINK = /^(https?:|mailto:)/i
const LINE_BREAK = /^<br\s*\/?>$/i

function tablesIn(node: Node): Node[] {
  if (node.type === 'table') return [node]
  return (node.children ?? []).flatMap(tablesIn)
}

/** A cell as plain text: no Markdown marks, and on one line so the row stays one row. */
function cellText(node: Node): string {
  if (node.type === 'break') return ' '
  if (node.type === 'image') return node.alt ?? ''
  if (node.type === 'html') return LINE_BREAK.test(node.value ?? '') ? ' ' : ''
  if (node.value !== undefined) return node.value
  return (node.children ?? []).map(cellText).join('')
}

const tabbed = (table: Node) => (table.children ?? []).map((row) => (row.children ?? []).map(cellText).join('\t')).join('\n')

/** Tables become tab-separated, which spreadsheets split into cells; the rest stays as written. */
function plainText(source: string, tables: Node[]): string {
  return tables.reduceRight((text, table) => {
    const start = table.position?.start.offset
    const end = table.position?.end.offset
    return start === undefined || end === undefined ? text : text.slice(0, start) + tabbed(table) + text.slice(end)
  }, source)
}

/** Rows already split by tabs, as a model might send a table. Leading empty cells are kept. */
function tabSeparated(text: string): Node | null {
  const rows = text.replace(/^(\r?\n)+|(\r?\n)+$/g, '').split(/\r?\n/).map((line) => line.split('\t'))
  if (rows.length < 2 || rows[0].length < 2 || rows.some((row) => row.length !== rows[0].length)) return null
  const cell = (value: string): Node => ({ type: 'tableCell', children: [{ type: 'text', value }] })
  return { type: 'table', children: rows.map((row) => ({ type: 'tableRow', children: row.map(cell) })) }
}

/**
 * Pasted HTML is live in the app it lands in: Word would fetch a remote picture, and a link stays
 * clickable. So pictures become their alt text and only web and mail links survive, in line with
 * the rule that answers never load remote images.
 */
function makeSafe(node: Node): void {
  if (!node.children) return
  node.children = node.children.flatMap((child): Node[] => {
    if (child.type === 'image') return child.alt ? [{ type: 'text', value: child.alt }] : []
    if (child.type === 'html') return LINE_BREAK.test(child.value ?? '') ? [{ type: 'break' }] : [child]
    if (child.type === 'link' && !SAFE_LINK.test(child.url ?? '')) {
      makeSafe(child)
      return child.children ?? []
    }
    makeSafe(child)
    return [child]
  })
}

/** Word shows a table with no borders as bare floating text, so each cell carries its own style. */
function styleTables(node: Node): void {
  const cellStyle = (extra: string) => `border:1px solid #999;padding:4px 8px;vertical-align:top;${extra}`
  if (node.type === 'element') {
    const align = node.properties?.align
    const textAlign = `text-align:${typeof align === 'string' ? align : 'left'};`
    if (node.tagName === 'table') node.properties = { ...node.properties, border: 1, style: 'border-collapse:collapse' }
    if (node.tagName === 'th') node.properties = { ...node.properties, style: cellStyle(`${textAlign}background:#f2f2f2`) }
    if (node.tagName === 'td') node.properties = { ...node.properties, style: cellStyle(textAlign) }
  }
  node.children?.forEach(styleTables)
}

function renderHtml(tree: Node): string {
  makeSafe(tree)
  const html = toHtml.runSync(tree as never) as unknown as Node
  styleTables(html)
  return toHtml.stringify(html as never)
}

/** Takes the code fence off a table sent as one, which would otherwise stay plain text. */
function unfenced(source: string): string {
  const inner = source.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/)?.[1]
  if (inner === undefined) return source
  return tabSeparated(inner) || tablesIn(parser.parse(inner) as Node).length ? inner : source
}

/**
 * Text with a table goes on the clipboard as HTML too, so Word, Pages and Mail paste a real table
 * and spreadsheets get cells. Anything else stays exactly as written.
 */
export function copyFormats(source: string): CopyFormats {
  const text = unfenced(source)
  const fromTabs = tabSeparated(text)
  if (fromTabs) return { text, html: renderHtml({ type: 'root', children: [fromTabs] }) }

  const tree = parser.parse(text) as Node
  const tables = tablesIn(tree)
  if (!tables.length) return { text: source }
  const plain = plainText(text, tables)
  return { text: plain, html: renderHtml(tree) }
}
