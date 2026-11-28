import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'
const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)
for (const typed of [true, false]) test(`probe typed=${typed}`, { tag: ['@probe'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Otter naps'
  world.reply(turn('How long do otters sleep?'), { say: 'About eleven hours a day.' })
  const panel = await otty.openPanel()
  panel.on('console', (m) => console.log('console:', m.type(), m.text()))
  await otty.ask(panel, 'How long do otters sleep?')
  await expect(panel.getByText('About eleven hours a day.')).toBeVisible()
  await panel.evaluate(() => {
    const w = window as any
    w.__log = []
    const t0 = performance.now()
    const d = (el: any) => (el ? `${el.tagName}.${String(el.className).slice(0, 40)}[${el.getAttribute?.('aria-label') ?? ''}]` : 'null')
    for (const t of ['pointerdown', 'mousedown', 'focusout', 'focusin', 'pointerup', 'mouseup', 'click', 'blur'])
      document.addEventListener(t, (e) => w.__log.push(`${Math.round(performance.now() - t0)} ${t} ${d(e.target)} trusted=${e.isTrusted} prevented=${e.defaultPrevented}`), true)
    window.otty.onChatEvent((e: any) => w.__log.push(`${Math.round(performance.now() - t0)} event ${e.type}${e.type === 'draft' ? ' ' + e.text : ''}${e.type === 'load' ? ' msgs=' + e.messages.length : ''}`))
  })
  if (typed) await panel.locator('textarea').fill('And in the winter?')
  const b = panel.getByRole('button', { name: 'New chat' })
  const box = await b.boundingBox()
  console.log('box', JSON.stringify(box), 'focus', await panel.evaluate(() => `${document.hasFocus()} ${document.activeElement?.tagName}`))
  console.log('at point', await panel.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.outerHTML.slice(0, 160) : 'null' }, [box!.x + box!.width / 2, box!.y + box!.height / 2]))
  const t = Date.now()
  await b.click()
  console.log('click took', Date.now() - t)
  await panel.waitForTimeout(1500)
  console.log('LOG\n' + (await panel.evaluate(() => (window as any).__log.join('\n'))))
  console.log('value', JSON.stringify(await panel.locator('textarea').inputValue()), 'msgs', await panel.locator('.msg').count())
})
