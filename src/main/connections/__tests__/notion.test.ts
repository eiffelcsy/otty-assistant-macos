// D-54: Notion titles and page text, cut and refused when wrong.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { send } from '../../net'
import { checkNotion, notionPage, notionSearch } from '../notion'
import { ConnectionError } from '../types'

vi.mock('../../net', () => ({ send: vi.fn() }))
const sendMock = vi.mocked(send)
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ID = '1234abcd1234abcd1234abcd1234abcd'

beforeEach(() => sendMock.mockReset())

describe('notion', () => {
  it('reads titles for pages and databases', async () => {
    sendMock.mockResolvedValueOnce(
      reply({
        results: [
          { object: 'page', id: 'p1', last_edited_time: '2026-11-01T00:00:00Z', url: 'https://notion.so/p1', properties: { Name: { type: 'title', title: [{ plain_text: 'Essay ' }, { plain_text: 'draft' }] } } },
          { object: 'database', id: 'd1', last_edited_time: '2026-11-01T00:00:00Z', title: [{ plain_text: 'Reading list' }] }
        ]
      })
    )
    const hits = await notionSearch('tok', 'essay')
    expect(hits.map((h) => h.title)).toEqual(['Essay draft', 'Reading list'])
  })

  it('check returns the user name', async () => {
    sendMock.mockResolvedValueOnce(reply({ name: 'Mei' }))
    expect(await checkNotion('tok')).toBe('Mei')
  })

  it('a 403 is an auth error', async () => {
    sendMock.mockResolvedValueOnce(reply({}, 403))
    await expect(checkNotion('tok')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('builds page text with headings and to-dos', async () => {
    sendMock
      .mockResolvedValueOnce(reply({ object: 'page', properties: { T: { type: 'title', title: [{ plain_text: 'Notes' }] } } }))
      .mockResolvedValueOnce(
        reply({
          results: [
            { type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Top' }] } },
            { type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'Done' }] } },
            { type: 'paragraph', paragraph: { rich_text: [] } }
          ],
          has_more: false
        })
      )
    const page = await notionPage('tok', ID)
    expect(page).toEqual({ title: 'Notes', text: '# Top\n[x] Done' })
  })

  it('cuts to the word limit', async () => {
    const long = Array.from({ length: 4100 }, (_, i) => `w${i}`).join(' ')
    sendMock
      .mockResolvedValueOnce(reply({ properties: {} }))
      .mockResolvedValueOnce(reply({ results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: long }] } }], has_more: false }))
    const page = await notionPage('tok', ID)
    expect(page.text.endsWith('\n…')).toBe(true)
    expect(page.text.split(/\s+/).length).toBe(4001)
  })

  it('refuses a bad id before any request', async () => {
    await expect(notionPage('tok', 'not-an-id')).rejects.toBeInstanceOf(ConnectionError)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
