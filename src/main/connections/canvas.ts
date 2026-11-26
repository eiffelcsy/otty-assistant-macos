// D-54: Canvas, read with the school's own token. Only what the model may see: titles, courses, due dates, cut short.
import { send } from '../net'
import { maskSecrets } from '../../shared/secrets'
import { ConnectionError, LIMITS, type CanvasAnnouncement, type CanvasItem } from './types'

const AUTH = 'Canvas didn’t accept that token. Check you copied all of it.'

async function getJson(url: string, token: string): Promise<any> {
  let res: Response
  try {
    res = await send(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LIMITS.connectMs)
    })
  } catch {
    throw new ConnectionError(`Otty can’t reach ${new URL(url).hostname}. Check the address and your connection.`, 'network')
  }
  if (res.status === 401 || res.status === 403) throw new ConnectionError(AUTH, 'auth')
  if (!res.ok) throw new ConnectionError(`Canvas didn’t answer as expected (error ${res.status}). Try again later.`, 'bad')
  return res.json().catch(() => {
    throw new ConnectionError('Canvas didn’t answer as expected (error 200). Try again later.', 'bad')
  })
}

/** Masked and cut, so nothing from the school reaches a return value raw. */
const clean = (value: unknown, max: number): string =>
  maskSecrets(typeof value === 'string' ? value : '').text.slice(0, max).trim()

/** The school's origin, from what the user typed: `canvas.nus.edu.sg` becomes `https://canvas.nus.edu.sg`. */
export function canvasOrigin(input: string): string {
  const text = input.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new ConnectionError('That doesn’t look like a Canvas address. It’s usually like canvas.nus.edu.sg.', 'bad')
  }
  if (url.protocol !== 'https:') {
    throw new ConnectionError('That doesn’t look like a Canvas address. It’s usually like canvas.nus.edu.sg.', 'bad')
  }
  return url.origin
}

/** The name on the token, to show as "signed in as". */
export async function checkCanvas(origin: string, token: string): Promise<string> {
  const me = await getJson(`${origin}/api/v1/users/self`, token)
  return typeof me?.name === 'string' ? clean(me.name, 100) || 'you' : 'you'
}

/** What is due between `from` and `to` (epoch ms), soonest first. */
export async function canvasDue(origin: string, token: string, from: number, to: number): Promise<CanvasItem[]> {
  const q = new URLSearchParams({
    start_date: new Date(from).toISOString(),
    end_date: new Date(to).toISOString(),
    per_page: '50'
  })
  const list = await getJson(`${origin}/api/v1/planner/items?${q}`, token)
  const items: CanvasItem[] = []
  for (const item of Array.isArray(list) ? list : []) {
    const plannable = item?.plannable ?? {}
    const title = clean(plannable.title ?? plannable.name, 200)
    if (!title) continue
    const due = Date.parse(item.plannable_date)
    items.push({
      title,
      course: clean(item.context_name, 100),
      ...(Number.isNaN(due) ? {} : { due }),
      kind: clean(item.plannable_type, 100),
      url: item.html_url ? new URL(item.html_url, origin).href : undefined
    })
  }
  return items
    .sort((a, b) => (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER))
    .slice(0, LIMITS.canvasItems)
}

/** Recent announcements from the user's active courses, newest first. */
export async function canvasAnnouncements(origin: string, token: string): Promise<CanvasAnnouncement[]> {
  const courses = await getJson(`${origin}/api/v1/courses?enrollment_state=active&per_page=50`, token)
  const list: { id: number | string; name?: string }[] = Array.isArray(courses) ? courses : []
  if (list.length === 0) return []
  const q = new URLSearchParams()
  for (const course of list) q.append('context_codes[]', `course_${course.id}`)
  q.append('per_page', '10')
  const posts = await getJson(`${origin}/api/v1/announcements?${q}`, token)
  const out: CanvasAnnouncement[] = []
  for (const post of Array.isArray(posts) ? posts : []) {
    const title = clean(post?.title, 200)
    if (!title) continue
    const course = list.find((c) => `course_${c.id}` === post.context_code)
    out.push({
      title,
      course: clean(course?.name, 100),
      posted: Date.parse(post.posted_at),
      message: maskSecrets(stripHtml(typeof post.message === 'string' ? post.message : '')).text.slice(0, 1500)
    })
  }
  return out
    .sort((a, b) => (b.posted || 0) - (a.posted || 0))
    .slice(0, LIMITS.announcements)
}

/** Tags out, common entities decoded, whitespace collapsed. Masking happens where the text is cut. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
