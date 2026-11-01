import { nativeImage, type NativeImage } from 'electron'

// A tiny otter-head silhouette for the menu bar, drawn in code so there's no asset to ship.
// It's a macOS template image: black + alpha, which the system tints for light/dark menu bars.

const PT = 18 // menu-bar icon size in points
const SCALE = 2 // drawn at @2x
const SS = 4 // supersamples per axis, for smooth edges

type Shape = { cx: number; cy: number; rx: number; ry: number }

// In the same 120×120 space as the Otter SVG.
const SOLID: Shape[] = [
  { cx: 60, cy: 64, rx: 48, ry: 40 }, // head
  { cx: 17, cy: 40, rx: 12, ry: 12 }, // ears
  { cx: 103, cy: 40, rx: 12, ry: 12 }
]
const HOLES: Shape[] = [
  { cx: 41, cy: 60, rx: 9.5, ry: 9.5 }, // eyes
  { cx: 79, cy: 60, rx: 9.5, ry: 9.5 },
  { cx: 60, cy: 77, rx: 7.5, ry: 5.5 } // nose
]

const inside = (s: Shape, x: number, y: number) => ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1

export function trayIcon(): NativeImage {
  const size = PT * SCALE
  const buf = Buffer.alloc(size * size * 4) // BGRA, all transparent
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 120
          const y = ((py + (sy + 0.5) / SS) / size) * 120
          if (SOLID.some((s) => inside(s, x, y)) && !HOLES.some((s) => inside(s, x, y))) hits++
        }
      }
      buf[(py * size + px) * 4 + 3] = Math.round((hits / (SS * SS)) * 255)
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: SCALE })
  img.setTemplateImage(true)
  return img
}
