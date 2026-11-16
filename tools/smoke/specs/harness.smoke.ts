// The harness checks itself (D-47): a smoke run can't leave the machine, and an unscripted request fails the test.
import { expect, test } from '../fixtures'

test('every way out of the machine is refused', { tag: ['@harness'] }, async ({ otty }) => {
  const refused = await otty.control((c) => c.probeEscapes())
  expect(refused).toEqual([
    'connect 1.1.1.1:443',
    'connect 1.1.1.1:443',
    'spawn /usr/bin/curl',
    'run /bin/sh -c echo hi'
  ])
})

test('the world refuses what nobody scripted', { tag: ['@harness'] }, async ({ otty, world }) => {
  const status = await otty.app.evaluate(async () => (await fetch('https://example.com/nothing-here')).status)
  expect(status).toBe(500)
  expect(world.unscripted).toEqual(['no page scripted for GET https://example.com/nothing-here'])
  world.unscripted.length = 0 // expected here, so the end-of-test check passes
})

test('a scripted page is served, and names resolve to a public test address', { tag: ['@harness'] }, async ({ otty, world }) => {
  world.page('https://example.com/otters', '<title>Otters</title><p>Sea otters hold hands.</p>')
  const text = await otty.app.evaluate(async () => (await fetch('https://example.com/otters')).text())
  expect(text).toContain('Sea otters hold hands.')
  const address = await otty.app.evaluate(async () => (await (process as unknown as { mainModule: NodeJS.Module }).mainModule.require('dns').promises.lookup('example.com')).address)
  expect(address).toBe('203.0.113.10')
})
