// D-48: properties of main's address guards, over many generated inputs.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isKnownUrl, urlsIn } from '../knownUrls'
import { isPrivateAddress } from '../pageReader'
import type { Message } from '../providers'

const octet = fc.integer({ min: 0, max: 255 })
const ip = (...parts: number[]) => parts.join('.')
const hex = (a: number, b: number) => ((a << 8) | b).toString(16)

describe('isPrivateAddress', () => {
  it('blocks every loopback, private and link-local IPv4 address', () => {
    const privateV4 = fc.oneof(
      fc.tuple(octet, octet, octet).map(([b, c, d]) => ip(10, b, c, d)),
      fc.tuple(octet, octet, octet).map(([b, c, d]) => ip(127, b, c, d)),
      fc.tuple(fc.integer({ min: 16, max: 31 }), octet, octet).map(([b, c, d]) => ip(172, b, c, d)),
      fc.tuple(octet, octet).map(([c, d]) => ip(192, 168, c, d)),
      fc.tuple(octet, octet).map(([c, d]) => ip(169, 254, c, d))
    )
    fc.assert(
      fc.property(privateV4, (a) => {
        expect(isPrivateAddress(a)).toBe(true)
      })
    )
  })

  it('judges an IPv4 address the same in IPv6 clothes, in either spelling', () => {
    fc.assert(
      fc.property(octet, octet, octet, octet, (a, b, c, d) => {
        const v4 = isPrivateAddress(ip(a, b, c, d))
        expect(isPrivateAddress(`::ffff:${ip(a, b, c, d)}`)).toBe(v4)
        expect(isPrivateAddress(`::ffff:${hex(a, b)}:${hex(c, d)}`)).toBe(v4)
      })
    )
  })

  it('counts anything that isn’t an address as private', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        fc.pre(!/^[\d.:a-f]+$/i.test(s))
        expect(isPrivateAddress(s)).toBe(true)
      })
    )
  })
})

describe('known addresses', () => {
  const user = (text: string): Message => ({ role: 'user', content: text })
  const said = (text: string): Message => ({ role: 'assistant', content: text })

  it('knows an address the user sent, and never one only the model wrote', () => {
    fc.assert(
      fc.property(fc.webUrl({ withQueryParameters: true }), (url) => {
        // Quotes and brackets end an address in prose, so such an address is never known: Otty asks first.
        fc.pre(!/["'`<>]/.test(url))
        const href = new URL(url).href
        expect(isKnownUrl(href, [user(`have a look at ${url} please`)])).toBe(true)
        expect(isKnownUrl(href, [user('hello'), said(`read ${url}`)])).toBe(false)
      })
    )
  })

  it('treats a known address with anything added as new', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.stringMatching(/^[a-z0-9]{1,12}$/), (url, data) => {
        const history = [user(`see ${url} `)]
        const longer = new URL(url)
        longer.searchParams.set('d', data)
        fc.pre(!urlsIn(history[0].content as string).includes(longer.href))
        expect(isKnownUrl(longer.href, history)).toBe(false)
      })
    )
  })
})
