// Builds the text reader for Apple Silicon and Intel into build/bin. It needs Swift, so it only runs on a Mac.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = join(root, 'tools/otty-ocr/main.swift')
const output = join(root, 'build/bin/otty-ocr')

const upToDate = () => existsSync(output) && statSync(output).mtimeMs > statSync(source).mtimeMs

if (process.platform === 'darwin' && !upToDate()) {
  mkdirSync(join(root, 'build/bin'), { recursive: true })
  const temp = mkdtempSync(join(tmpdir(), 'otty-ocr-'))
  try {
    const slices = ['arm64', 'x86_64'].map((arch) => {
      const slice = join(temp, arch)
      execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos12`, source, '-o', slice], { stdio: 'inherit' })
      return slice
    })
    execFileSync('lipo', ['-create', ...slices, '-output', output], { stdio: 'inherit' })
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
