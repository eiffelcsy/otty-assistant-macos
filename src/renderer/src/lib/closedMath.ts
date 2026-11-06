/** While an answer streams, a `$$` with no partner yet stays plain text, so the layout doesn't jump. */
export function closedMath(text: string): string {
  const parts = text.split('$$')
  if (parts.length % 2 === 1) return text
  return `${parts.slice(0, -1).join('$$')}\\$\\$${parts.at(-1)}`
}
