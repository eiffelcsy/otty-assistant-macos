// node tools/eval/compare.mjs a.json b.json — two saved runs side by side, and the cases where they differ.
import { readFileSync } from 'node:fs'

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')))
if (!a || !b) {
  console.error('Usage: npm run eval:compare -- tools/eval/results/a.json tools/eval/results/b.json')
  process.exit(1)
}
const pct = (run, set) => run.rows.find((r) => r.set === set)
const sets = [...new Set([...a.rows, ...b.rows].map((r) => r.set))]
console.log(`${'set'.padEnd(10)} ${a.model.padEnd(24)} ${b.model}`)
for (const set of sets) {
  const cell = (r) => (r ? `${r.passed}/${r.total} (${r.pct}%), ${r.medianFirstTokenMs ?? '—'} ms` : '—')
  console.log(`${set.padEnd(10)} ${cell(pct(a, set)).padEnd(24)} ${cell(pct(b, set))}`)
}
const passed = (run) => new Map(run.results.map((r) => [r.id, r.pass]))
const [pa, pb] = [passed(a), passed(b)]
const differ = [...pa.keys()].filter((id) => pb.has(id) && pa.get(id) !== pb.get(id))
if (differ.length) console.log(`\nDiffer:\n${differ.map((id) => `  ${id}: ${a.model} ${pa.get(id) ? 'pass' : 'FAIL'}, ${b.model} ${pb.get(id) ? 'pass' : 'FAIL'}`).join('\n')}`)
