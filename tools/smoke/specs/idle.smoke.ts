// D-48: a stand-in for the idle budget (NFR-3) that CPU noise can't flake. The otter is on screen all day, so
// nothing may animate smoothly there forever while Otty is idle. OTTY_METRICS=1 stays the by-hand number.
import { expect, test } from '../fixtures'

test('the idle otter runs no smooth endless animation', async ({ otty }) => {
  const bubble = await otty.view('bubble')
  // Let the greeting and any blink settle.
  await bubble.waitForTimeout(3_000)
  const endless = await bubble.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
      // A stepped animation (`steps()`) redraws only on its steps, which the budget allows.
      .filter((a) => !(a.effect as KeyframeEffect).getKeyframes().every((k) => k.easing.startsWith('steps')))
      .map((a) => (a as CSSAnimation).animationName ?? 'a script animation')
  )
  expect(endless, 'a smooth infinite animation on the bubble redraws all day: step it, or run it briefly').toEqual([])
})
