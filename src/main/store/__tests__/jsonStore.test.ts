import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { JsonChatStore } from '../jsonStore'
import { fixtures, searchContract } from './search.contract'

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'otty-chats-')), 'chats.json')

searchContract('json', async () => new JsonChatStore(tmpFile()))

describe('JsonChatStore', () => {
  it('lists newest saved first and survives a reload', async () => {
    const file = tmpFile()
    const a = new JsonChatStore(file)
    for (const t of fixtures()) await a.save(t)
    expect((await a.list()).map((c) => c.id)).toEqual(['wifi', 'print', 'otters', 'excel'])
    const b = new JsonChatStore(file)
    expect((await b.search('打印')).map((h) => h.chatId)).toEqual(['print'])
  })

  it('never writes pictures to disk', async () => {
    const file = tmpFile()
    const store = new JsonChatStore(file)
    const [t] = fixtures()
    t.messages[0] = {
      ...t.messages[0],
      captures: [
        { id: 'a', context: { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 }, app: null },
        { id: 'b', context: { kind: 'image', dataUrl: 'data:image/png;base64,CCCC', width: 1, height: 1 }, app: null }
      ],
      files: [{ id: 'p', name: 'photo.jpg', kind: 'image', thumb: 'data:image/jpeg;base64,BBBB' }]
    } as never
    await store.save(t)
    expect(readFileSync(file, 'utf8')).toContain('photo.jpg')
    expect(readFileSync(file, 'utf8')).not.toContain('base64')
  })

  it('reads chats saved before the capture tray as one-capture messages', async () => {
    const file = tmpFile()
    const app = { name: 'Safari', title: 'Pricing' }
    const legacy = {
      id: 'old',
      title: 'Explain this',
      createdAt: 1,
      updatedAt: 1,
      history: [],
      messages: [
        { id: 'u1', role: 'user', text: 'Explain this', context: { kind: 'text', text: 'Annual plans save 20%' }, app },
        { id: 'u2', role: 'user', text: 'And this?', context: null, app: null }
      ]
    }
    writeFileSync(file, JSON.stringify([legacy]))
    const store = new JsonChatStore(file)
    const [first, second] = (await store.get('old'))!.messages
    expect(first).toMatchObject({ app: null, captures: [{ context: { kind: 'text', text: 'Annual plans save 20%' }, app }] })
    expect(first).not.toHaveProperty('context')
    expect(second).toMatchObject({ captures: [], app: null })
    expect((await store.search('annual')).map((h) => h.chatId)).toEqual(['old'])
  })

  it('skips empty threads', async () => {
    const store = new JsonChatStore(tmpFile())
    await store.save({ ...fixtures()[0], messages: [] })
    expect(await store.list()).toEqual([])
  })
})
