// D-54: Canvas reads, mapped and cut; auth and network failures are typed.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { send } from '../../net'
import { canvasDue, canvasOrigin, canvasAnnouncements } from '../canvas'
import { ConnectionError } from '../types'

vi.mock('../../net', () => ({ send: vi.fn() }))
const sendMock = vi.mocked(send)
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => sendMock.mockReset())

describe('canvasOrigin', () => {
  it('adds https and keeps the origin', () => {
    expect(canvasOrigin(' canvas.nus.edu.sg/courses/1 ')).toBe('https://canvas.nus.edu.sg')
    expect(canvasOrigin('https://canvas.nus.edu.sg')).toBe('https://canvas.nus.edu.sg')
  })
  it('refuses http and nonsense', () => {
    expect(() => canvasOrigin('http://canvas.nus.edu.sg')).toThrow(ConnectionError)
    expect(() => canvasOrigin('https://')).toThrow(ConnectionError)
  })
})

describe('canvasDue', () => {
  it('maps, sorts undated last and cuts', async () => {
    sendMock.mockResolvedValueOnce(
      reply([
        { plannable: { title: 'Later' }, context_name: 'CS', plannable_date: '2026-12-05T00:00:00Z', plannable_type: 'assignment', html_url: '/a/2' },
        { plannable: { name: 'Quiz' }, plannable_date: '2026-12-01T00:00:00Z', plannable_type: 'quiz' },
        { plannable: {}, plannable_date: '2026-12-01T00:00:00Z' }
      ])
    )
    const items = await canvasDue('https://c.example', 'tok', 0, 1)
    expect(items.map((i) => i.title)).toEqual(['Quiz', 'Later'])
    expect(items[1]).toMatchObject({ course: 'CS', kind: 'assignment', url: 'https://c.example/a/2' })
    expect(items[0].due).toBe(Date.parse('2026-12-01T00:00:00Z'))
  })
  it('a 401 is an auth error', async () => {
    sendMock.mockResolvedValueOnce(reply({}, 401))
    await expect(canvasDue('https://c.example', 'tok', 0, 1)).rejects.toMatchObject({ kind: 'auth' })
  })
  it('a network failure is a network error', async () => {
    sendMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(canvasDue('https://c.example', 'tok', 0, 1)).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('canvasAnnouncements', () => {
  it('names the course and strips HTML', async () => {
    sendMock
      .mockResolvedValueOnce(reply([{ id: 7, name: 'Algebra' }]))
      .mockResolvedValueOnce(reply([{ title: 'Hi', context_code: 'course_7', posted_at: '2026-11-01T00:00:00Z', message: '<p>Hello &amp; <b>bye</b></p>' }]))
    const posts = await canvasAnnouncements('https://c.example', 'tok')
    expect(posts).toEqual([{ title: 'Hi', course: 'Algebra', posted: Date.parse('2026-11-01T00:00:00Z'), message: 'Hello & bye' }])
  })
})
