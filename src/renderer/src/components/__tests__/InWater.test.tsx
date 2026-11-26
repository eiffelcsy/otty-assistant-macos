// @vitest-environment jsdom
// D-83: Otty in the water: the layers, the frame's mask, and ripples that play once per trigger.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Glints, InWater, Ripple, RefractFilter } from '../InWater'

afterEach(cleanup)

describe('InWater (D-83)', () => {
  it('draws the frame above and under the waterline, the tint, the shadow and the waterline', () => {
    const { container } = render(
      <InWater water="water.webp" maskSrc="frame.webp" frames={<img className="frame" src="frame.webp" alt="" />} />
    )
    expect(container.querySelectorAll('.in-water__above .frame').length).toBe(1)
    expect(container.querySelectorAll('.in-water__under .frame').length).toBe(1)
    expect(container.querySelector('.in-water__tint')).not.toBeNull()
    expect(container.querySelector('.in-water__shadow')).not.toBeNull()
    expect(container.querySelector('.in-water__line')).not.toBeNull()
  })

  it('masks the tint by the frame shown, and the wave above it', () => {
    const { container } = render(
      <InWater water="water.webp" maskSrc="frame-b.webp" frames={<img src="frame-b.webp" alt="" />} />
    )
    const tint = container.querySelector<HTMLElement>('.in-water__tint')!
    expect(tint.style.maskImage).toContain('frame-b.webp')
    expect(container.querySelector<HTMLElement>('.in-water__above')!.style.maskImage).toContain('data:image/svg+xml')
  })

  it('takes the waterline as a share of the height', () => {
    const { container } = render(<InWater water="w" maskSrc="m" waterline={0.7} frames={null} />)
    expect(container.querySelector<HTMLElement>('.in-water')!.style.getPropertyValue('--waterline')).toBe('70%')
  })

  it('defines the refraction filter once', () => {
    const { container } = render(<RefractFilter />)
    expect(container.querySelector('filter#otty-refract feDisplacementMap')).not.toBeNull()
  })

  it('shows nothing for a ripple of trigger 0', () => {
    const { container } = render(<Ripple trigger={0} />)
    expect(container.querySelector('.in-water__ripple')).toBeNull()
  })

  it('plays one ripple per trigger, remounting it on a new one', () => {
    const { container, rerender } = render(<Ripple trigger={1} />)
    const first = container.querySelector('.in-water__ripple')
    expect(first).not.toBeNull()
    rerender(<Ripple trigger={2} />)
    expect(container.querySelectorAll('.in-water__ripple').length).toBe(1)
    expect(container.querySelector('.in-water__ripple')).not.toBe(first)
  })

  it('keeps the glints at rest, and twinkles them on a change', () => {
    const { container, rerender } = render(<Glints twinkle={0} />)
    expect(container.querySelector('.in-water__glints--twinkle')).toBeNull()
    rerender(<Glints twinkle={1} />)
    expect(container.querySelector('.in-water__glints--twinkle')).not.toBeNull()
  })

  it('draws only the submerged layers for part under, and only the surface for part above', () => {
    const frames = <img className="frame" src="f.webp" alt="" />
    const under = render(<InWater part="under" water="w" maskSrc="m" frames={frames} />).container
    expect(under.querySelector('.in-water__above')).toBeNull()
    expect(under.querySelector('.in-water__under--flow .frame')).not.toBeNull()
    expect(under.querySelector('.in-water__tint')).not.toBeNull()
    expect(under.querySelector('.in-water__shadow')).not.toBeNull()
    expect(under.querySelector('.in-water__line')).toBeNull()
    cleanup()
    const above = render(<InWater part="above" water="w" maskSrc="m" frames={frames} />).container
    expect(above.querySelector('.in-water__above .frame')).not.toBeNull()
    expect(above.querySelector('.in-water__under')).toBeNull()
    expect(above.querySelector('.in-water__tint')).toBeNull()
    expect(above.querySelector('.in-water__line')).not.toBeNull()
  })
})
