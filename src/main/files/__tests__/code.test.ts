import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { fitDocument, fitFiles, numberLines, sampleText } from '../budget'
import { extract, FileError, kindOf } from '../extract'
import { codeLanguage } from '../languages'
import { OUTPUT_CHARS, readNotebook } from '../notebook'
import { HIDDEN, maskSecrets } from '../secrets'

const fixture = (name: string) => join(__dirname, 'fixtures', name)

describe('code files', () => {
  it('knows code by extension and by whole name', () => {
    expect(kindOf('train.py')).toBe('code')
    expect(kindOf('App.TSX')).toBe('code')
    expect(kindOf('Dockerfile')).toBe('code')
    expect(kindOf('Dockerfile.dev')).toBe('code')
    expect(kindOf('Makefile')).toBe('code')
    expect(kindOf('.env.local')).toBe('code')
    expect(kindOf('analysis.ipynb')).toBe('notebook')
    expect(kindOf('notes.md')).toBe('text')
    expect(kindOf('old.doc')).toBe('doc')
    expect(kindOf('letter.rtf')).toBe('doc')
    expect(kindOf('README')).toBeNull()
    expect(codeLanguage('train.py')).toBe('Python')
    expect(codeLanguage('main.rs')).toBe('Rust')
    expect(codeLanguage('Dockerfile')).toBe('Dockerfile')
  })

  it('reads code with its language', async () => {
    const doc = await extract(fixture('train.py'), 'code', 'train.py')
    expect(doc).toEqual({ kind: 'code', lang: 'Python', text: 'import math\n\ndef area(r):\n    return math.pi * r ** 2' })
  })

  it('sends code with line numbers and a label', () => {
    const doc = { kind: 'code' as const, lang: 'Python', text: 'a = 1\nb = 2' }
    const { block, note } = fitDocument(1, 'x.py', doc, 1000)
    expect(block).toBe('[File 1: x.py · Python · 2 lines]\n1│ a = 1\n2│ b = 2\n[End of file 1]')
    expect(note).toBeUndefined()
    expect(numberLines(Array(12).fill('x').join('\n'))[0]).toBe(' 1│ x')
  })

  it('cuts big code at a whole line and says which lines were read', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `value_${i} = compute(${i})`).join('\n')
    const { block, note } = fitDocument(1, 'big.py', { kind: 'code', lang: 'Python', text }, 500)
    expect(note).toMatch(/^Otty read lines 1–\d+ of 2,000\.$/)
    const lines = block.split('\n').filter((l) => /│/.test(l))
    expect(lines.at(-1)).toMatch(/^\s*\d+│ value_\d+ = compute\(\d+\)$/)
  })
})

describe('older documents', () => {
  it.runIf(process.platform === 'darwin')('reads RTF as words, not markup, with macOS textutil', async () => {
    expect(await extract(fixture('letter.rtf'), 'doc')).toEqual({ kind: 'doc', text: 'Otters hold hands.' })
  })
})

describe('notebooks', () => {
  it('reads cells with text outputs and errors, and leaves pictures out', async () => {
    const doc = await extract(fixture('otters.ipynb'), 'notebook', 'otters.ipynb')
    if (doc.kind !== 'notebook') throw new Error('not a notebook')
    expect(doc.lang).toBe('Python')
    expect(doc.cells.map((c) => c.type)).toEqual(['notes', 'code', 'code', 'code'])
    expect(doc.cells[2].text).toBe('df.plot()\n>>> output:\n[a chart or picture output]')
    expect(doc.cells[3].text).toContain('total 12')
    expect(doc.cells[3].text).toContain("KeyError: 'rivr'")
    expect(doc.cells[3].text).not.toContain('\x1b')
    const [out] = fitFiles([{ name: 'otters.ipynb', doc }])
    expect(out.text).toContain('[File 1: otters.ipynb · Python notebook · 4 cells]')
    expect(out.text).toContain('--- cell 4 · code [3] ---')
    expect(out.text).toContain('--- cell 1 · notes ---')
    expect(out.text).not.toContain('iVBOR')
  })

  it('shortens a huge output', () => {
    const nb = readNotebook(
      JSON.stringify({
        nbformat: 4,
        cells: [{ cell_type: 'code', source: 'df', outputs: [{ output_type: 'execute_result', data: { 'text/plain': 'x'.repeat(50_000) } }] }]
      })
    )
    expect(nb.cells[0].text.length).toBeLessThan(OUTPUT_CHARS + 100)
    expect(nb.cells[0].text).toMatch(/\(output shortened\)$/)
  })

  it('turns away broken, old and empty notebooks kindly', () => {
    expect(() => readNotebook('{not json')).toThrow(FileError)
    expect(() => readNotebook(JSON.stringify({ nbformat: 3, worksheets: [] }))).toThrow(/old format/)
    expect(() => readNotebook(JSON.stringify({ nbformat: 4, cells: [{ cell_type: 'code', source: [], outputs: [] }] }))).toThrow(/empty/)
  })
})

describe('maskSecrets', () => {
  const hide = (s: string) => maskSecrets(s)

  it('hides well-known key shapes anywhere', () => {
    for (const secret of [
      'sk-proj-abcdefghijklmnop1234',
      'sk-ant-api03-abcdefghijklmnopqrstuvwx',
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'xoxb-1234567890-abcdefghij',
      'AIzaSyA1234567890abcdefghijklmnopqrstuv',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    ]) {
      const out = hide(`use ${secret} here`)
      expect(out.text).toBe(`use ${HIDDEN} here`)
      expect(out.hidden).toBe(1)
    }
    expect(hide('-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----').text).toBe(HIDDEN)
    expect(hide('Authorization: Bearer abcdefghijklmnop1234').text).toBe(`Authorization: Bearer ${HIDDEN}`)
    expect(hide('postgres://otty:s3cretpass@db.local/app').text).toBe(`postgres://otty:${HIDDEN}@db.local/app`)
  })

  it('hides values given to secret names, in .env, YAML, JSON and code', () => {
    expect(hide('DB_PASSWORD=correcthorse').text).toBe(`DB_PASSWORD=${HIDDEN}`)
    expect(hide('export API_KEY="abcd1234"').text).toBe(`export API_KEY="${HIDDEN}"`)
    expect(hide('  client_secret: averylongvalue').text).toBe(`  client_secret: ${HIDDEN}`)
    expect(hide('{"apiKey": "abcd1234"}').text).toBe(`{"apiKey": "${HIDDEN}"}`)
    expect(hide("password = 'hunter22'").text).toBe(`password = '${HIDDEN}'`)
  })

  it('leaves ordinary code and settings alone', () => {
    for (const fine of [
      'password = input("Password: ")',
      'token = get_token()',
      'api_key = os.environ["API_KEY"]',
      'self.secret = config.secret_value',
      'max_tokens = 1024',
      'tokenizer: bert-base-uncased',
      'author: Jonathan Smith',
      'DEBUG=true',
      'API_KEY=your-api-key-here',
      'SECRET_KEY=${SECRET_KEY}',
      'def check_password(pw):'
    ]) {
      expect(hide(fine)).toEqual({ text: fine, hidden: 0 })
    }
  })

  it('runs on attached files, and the model is told', async () => {
    const doc = await extract(fixture('secrets.env'), 'code', 'secrets.env')
    if (doc.kind !== 'code') throw new Error('not code')
    expect(doc.hidden).toBe(2)
    expect(doc.text).not.toContain('sk-test')
    expect(doc.text).not.toContain('hunter2')
    expect(doc.text).toContain('PORT=8080')
    const [out] = fitFiles([{ name: 'secrets.env', doc }])
    expect(out.text).toContain('Otty replaced 2 things that looked like a key or password')
  })
})

describe('sampleText', () => {
  it('takes the words of documents and notebook notes, not code', () => {
    expect(
      sampleText([
        { kind: 'code', lang: 'Python', text: 'print(1)' },
        { kind: 'pdf', pages: ['租客須提前一個月通知。'] },
        { kind: 'notebook', lang: 'Python', cells: [{ type: 'notes', text: '水獺' }, { type: 'code', text: 'x = 1' }] }
      ])
    ).toBe('租客須提前一個月通知。\n水獺')
  })
})
