import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/types'
import type { ChatStore, Thread } from '../types'

// The search contract every ChatStore backend must pass. Run it from a backend's own test file:
//   searchContract('json', async () => new JsonChatStore(tmpFile()))
// It checks which chats match and what they point at, not the exact order of equally good hits.

let n = 0
function thread(id: string, title: string, updatedAt: number, messages: ChatMessage[]): Thread {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    messages: messages.map((m) => ({ ...m, id: `${id}-m${n++}` })),
    history: []
  }
}

const user = (text: string, captured?: string): ChatMessage => ({
  id: '',
  role: 'user',
  text,
  context: captured ? { kind: 'text', text: captured } : null,
  app: null
})
const otty = (text: string): ChatMessage => ({ id: '', role: 'assistant', text, tools: [] })

export const fixtures = (): Thread[] => [
  thread('excel', 'Explain this simply “#N/A”', 1000, [
    user('Explain this simply', '=VLOOKUP(A2, Prices!A:B, 2, FALSE) returns #N/A'),
    otty('**VLOOKUP** couldn’t find the value in the first column. Check for extra spaces, or use [IFERROR](#explain).')
  ]),
  thread('otters', 'Do otters hold hands?', 2000, [
    user('Do otters hold hands?'),
    otty('Yes! Sea otters hold paws while they sleep, so they don’t drift apart. It’s called a **raft**.'),
    user('How long do otters sleep?'),
    otty('Sea otters sleep around 11 hours a day.')
  ]),
  thread('print', '點樣 save 做 PDF？', 3000, [
    user('點樣 save 做 PDF？'),
    otty('1. 按「File」（檔案）。\n2. 揀「Print」（打印）。\n3. 喺左下角揀「Save as PDF」。')
  ]),
  thread('wifi', 'My Wi-Fi keeps dropping', 4000, [
    { ...user('My Wi-Fi keeps dropping'), files: [{ id: 'f1', name: 'Router-Manual.docx', kind: 'docx' }] } as ChatMessage,
    otty('Try turning the router off and on again. If the Wi‑Fi still drops, forget the network and rejoin.')
  ])
]

export function searchContract(name: string, makeStore: () => Promise<ChatStore>): void {
  describe(`ChatStore search contract: ${name}`, () => {
    let store: ChatStore

    beforeEach(async () => {
      store = await makeStore()
      for (const t of fixtures()) await store.save(t)
    })

    const ids = async (q: string) => (await store.search(q)).map((h) => h.chatId).sort()

    it('finds English words in any message, case-insensitively', async () => {
      expect(await ids('otter')).toEqual(['otters'])
      expect(await ids('VLOOKUP')).toEqual(['excel'])
      expect(await ids('vlookup')).toEqual(['excel'])
      expect(await ids('ROUTER')).toEqual(['wifi'])
    })

    it('finds Chinese terms, including one and two characters', async () => {
      expect(await ids('打印')).toEqual(['print'])
      expect(await ids('「打印」')).toEqual(['print'])
      expect(await ids('印')).toEqual(['print'])
      expect(await ids('點樣')).toEqual(['print'])
    })

    it('needs every term, in any message', async () => {
      expect(await ids('otters sleep')).toEqual(['otters'])
      expect(await ids('otters router')).toEqual([])
      expect(await ids('raft hours')).toEqual(['otters'])
    })

    it('keeps quoted phrases together', async () => {
      expect(await ids('"hold paws"')).toEqual(['otters'])
      expect(await ids('"paws hold"')).toEqual([])
      expect(await ids('“save as pdf”')).toEqual(['print'])
    })

    it('searches attached file names', async () => {
      expect(await ids('router-manual')).toEqual(['wifi'])
    })

    it('searches text captures but not markdown or link targets', async () => {
      expect(await ids('Prices!A:B')).toEqual(['excel'])
      expect(await ids('#explain')).toEqual([])
      expect(await ids('**')).toEqual([])
    })

    it('folds width and compatibility forms (NFKC)', async () => {
      expect(await ids('ＰＤＦ')).toEqual(['print'])
      expect(await ids('wi-fi')).toEqual(['wifi'])
    })

    it('returns nothing for an empty or unmatched query', async () => {
      expect(await store.search('')).toEqual([])
      expect(await store.search('   ')).toEqual([])
      expect(await store.search('platypus')).toEqual([])
    })

    it('points at the best message, with a snippet whose ranges mark the match', async () => {
      const [hit] = await store.search('raft')
      const t = fixtures().find((f) => f.id === 'otters')!
      expect(hit.title).toBe(t.title)
      expect(hit.updatedAt).toBe(2000)
      const target = (await store.get('otters'))!.messages.find((m) => m.id === hit.messageId)
      expect(target?.text).toContain('raft')
      expect(hit.snippet.ranges.length).toBeGreaterThan(0)
      for (const [s, e] of hit.snippet.ranges) expect(hit.snippet.text.slice(s, e).toLowerCase()).toBe('raft')
      expect(hit.snippet.text).not.toContain('**')
    })

    it('ranks a title match first, then more matching messages, then the newest', async () => {
      const hits = await store.search('sleep')
      expect(hits.map((h) => h.chatId)).toEqual(['otters'])
      const two = await store.search('the')
      expect(two.length).toBeGreaterThan(1)
      const titleFirst = await store.search('otters')
      expect(titleFirst[0].chatId).toBe('otters')
    })

    it('respects the limit', async () => {
      expect((await store.search('e', { limit: 2 })).length).toBe(2)
    })

    it('forgets deleted chats', async () => {
      await store.delete('otters')
      expect(await ids('otter')).toEqual([])
      await store.clear()
      expect(await ids('PDF')).toEqual([])
    })
  })
}
