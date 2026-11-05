export interface DiffPart {
  kind: 'same' | 'removed' | 'added'
  text: string
}

/** Past this, comparing would be slow, because the work grows with the square of the length. */
const MAX_CHARS = 4_000

/** Words, spaces and punctuation, with each Han character on its own, since Chinese has no spaces to split on. */
function tokens(text: string): string[] {
  return text.match(/\p{Script=Han}|\s+|[\p{L}\p{N}'’_-]+|[\s\S]/gu) ?? []
}

/** How `before` became `after`, word by word. Null when the text is too long to compare. */
export function wordDiff(before: string, after: string): DiffPart[] | null {
  if (before.length > MAX_CHARS || after.length > MAX_CHARS) return null
  const a = tokens(before)
  const b = tokens(after)
  const width = b.length + 1
  const common = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] = a[i] === b[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts.at(-1)
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (j >= b.length || (i < a.length && common[(i + 1) * width + j] >= common[i * width + j + 1])) {
      push('removed', a[i++])
    } else {
      push('added', b[j++])
    }
  }
  return parts
}

/** An answer without its ```fixed fence, for copying as plain text. */
export function withoutFixedFence(answer: string): string {
  return answer.replace(/^```fixed\n([\s\S]*?)\n?```$/gm, '$1')
}
