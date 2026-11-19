import { describe, expect, it } from 'vitest'
import { mermaidConfig, type DrawTheme } from '../render'

const t: DrawTheme = {
  bg: 'bg', surface: 'surface', text: 'text', heading: 'heading', muted: 'muted', brand: 'brand', accent: 'accent', hairline: 'hairline', font: 'font',
  series: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
  ink: 'ink'
}

describe('Mermaid with Otty’s palette (D-70)', () => {
  const config = mermaidConfig(t)
  it('colours pies and bars from the chart tokens, in order', () => {
    expect([1, 2, 3, 4, 5, 6].map((i) => config.themeVariables[`pie${i}` as 'pie1'])).toEqual(t.series)
    expect(config.themeVariables.xyChart.plotColorPalette).toBe('c1,c2,c3,c4,c5,c6')
  })
  it('keeps labels in text colours and slices apart on the surface', () => {
    expect(config.themeVariables.pieLegendTextColor).toBe('muted')
    expect(config.themeVariables.pieStrokeColor).toBe('surface')
    expect(config.themeVariables.xyChart.xAxisLabelColor).toBe('muted')
  })
  it('stays strict, with no HTML labels', () => {
    expect(config.securityLevel).toBe('strict')
    expect(config.htmlLabels).toBe(false)
  })
})
