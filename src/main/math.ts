import type { MathNode } from 'mathjs'
import { bareExpression, MATH_FUNCTIONS, normalizeMath } from '../shared/math'

// Otty's calculator (D-12). Numbers come from here rather than from the model's memory. Everything that gets evaluated
// is first checked against an allowlist, so a calculation is bounded and synchronous and needs no process of its own.

type Math = ReturnType<typeof import('mathjs').create>

const MAX_LENGTH = 500
const MAX_STEPS = 30
const MAX_ITEMS = 1_000
const MAX_FACTORIAL = 1_000
const SHOWN_DIGITS = 14

const FUNCTIONS = new Set<string>([...MATH_FUNCTIONS, 'to', 'factorial'])
const OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus', 'mod', 'to', 'factorial', 'dotMultiply', 'dotDivide'])
const CONSTANTS = new Set(['pi', 'e', 'tau', 'phi'])

let loading: Promise<Math> | null = null

/** Loading mathjs takes about 100 ms, so main does it after the windows open, and no question waits for it. */
export function loadMath(): Promise<Math> {
  return (loading ??= import('mathjs').then(({ create, all }) => create(all, { number: 'BigNumber', precision: 34 })))
}

class MathError extends Error {}

/** Refuses anything off the allowlist, before it can run. */
function check(math: Math, root: MathNode, scope: Map<string, unknown>): void {
  root.traverse((node, _path, parent) => {
    const n = node as any
    switch (n.type) {
      case 'ConstantNode':
        if (!math.isNumeric(n.value)) throw new MathError('Only numbers can be calculated.')
        return
      case 'ParenthesisNode':
        return
      case 'OperatorNode':
        if (!OPERATORS.has(n.fn)) throw new MathError(`“${n.op}” can’t be used here.`)
        if (n.fn === 'factorial') checkFactorial(n.args[0])
        return
      case 'FunctionNode':
        if (n.fn?.type !== 'SymbolNode' || !FUNCTIONS.has(n.fn.name)) throw new MathError(`“${n.fn?.name ?? 'that'}” can’t be used here.`)
        if (n.fn.name === 'factorial') checkFactorial(n.args[0])
        return
      case 'ArrayNode':
        if (n.items.length > MAX_ITEMS) throw new MathError('That list is too long.')
        return
      case 'AssignmentNode':
        if (n.object.type !== 'SymbolNode' || n.index || parent) throw new MathError('Only a plain name can be given a value.')
        if (FUNCTIONS.has(n.object.name) || CONSTANTS.has(n.object.name)) throw new MathError(`“${n.object.name}” is a reserved name.`)
        return
      case 'SymbolNode': {
        // The name of a function being called, or being assigned, was checked above.
        if ((parent as any)?.fn === n || (parent as any)?.object === n) return
        if (CONSTANTS.has(n.name) || scope.has(n.name) || math.Unit.isValuelessUnit(n.name)) return
        throw new MathError(unknownName(math, n.name))
      }
      default:
        throw new MathError('That can’t be calculated here.')
    }
  })
}

function checkFactorial(arg: { value?: unknown }): void {
  if (Number(arg?.value) > MAX_FACTORIAL || arg?.value === undefined) throw new MathError(`Factorials only go up to ${MAX_FACTORIAL}, on plain numbers.`)
}

function unknownName(math: Math, name: string): string {
  const single = name.replace(/s$/, '')
  return single !== name && math.Unit.isValuelessUnit(single) ? `Unknown unit “${name}”, did you mean “${single}”?` : `Unknown name “${name}”.`
}

/** The exact value, for the model to carry on from. */
function plain(math: Math, value: unknown): string {
  return math.format(value, { precision: SHOWN_DIGITS, lowerExp: -9, upperExp: 18 } as never)
}

/** With thousands separators, for people. */
export function withSeparators(value: string): string {
  return value.replace(/^-?\d{4,}/, (n) => n.replace(/\B(?=(\d{3})+$)/g, ','))
}

function evaluate(math: Math, source: string, scope: Map<string, unknown>): { name?: string; value: string } {
  if (source.length > MAX_LENGTH) throw new MathError('That calculation is too long.')
  const text = normalizeMath(source)
  let root: MathNode
  try {
    root = math.parse(text)
  } catch {
    throw new MathError(`Couldn’t read “${source.slice(0, 40)}”.`)
  }
  check(math, root, scope)
  let result: unknown
  try {
    result = root.compile().evaluate(scope)
  } catch (err) {
    throw new MathError((err as Error).message.split('\n')[0].slice(0, 120))
  }
  const fine = math.isUnit(result) || ((math.isBigNumber(result) || typeof result === 'number') && Number.isFinite(Number(result)))
  if (!fine) throw new MathError('That doesn’t have a number for an answer.')
  const name = (root as any).type === 'AssignmentNode' ? (root as any).object.name : undefined
  return { ...(name ? { name } : {}), value: plain(math, result) }
}

export interface Calculated {
  /** One line per step, for the model. */
  result: string
  ok: boolean
  /** For the chip. */
  label?: string
  /** The last value, for tapping the chip. */
  value?: string
}

const pretty = (s: string) => s.replace(/\*/g, '×').replace(/\s+/g, ' ').trim()

/** Runs the steps in order, sharing their names. It stops at the first that fails, keeping the ones before it. */
export async function calculate(input: unknown): Promise<Calculated> {
  const math = await loadMath()
  const steps = (Array.isArray(input) ? input : [input]).map(String).filter((s) => s.trim())
  if (!steps.length) return { result: 'Give calculate at least one step.', ok: false }
  if (steps.length > MAX_STEPS) return { result: `At most ${MAX_STEPS} steps at a time.`, ok: false }

  const scope = new Map<string, unknown>()
  const lines: string[] = []
  let last: { name?: string; value: string } | undefined
  for (const [i, step] of steps.entries()) {
    try {
      last = evaluate(math, step, scope)
      lines.push(last.name ? `${last.name} = ${last.value}` : `${step.trim()} = ${last.value}`)
    } catch (err) {
      if (!(err instanceof MathError)) throw err
      lines.push(`Step ${i + 1} (${step.trim().slice(0, 60)}): ${err.message}`)
      return { result: lines.join('\n'), ok: false }
    }
  }
  const shown = withSeparators(last!.value)
  const what = steps.length === 1 ? pretty(steps[0].replace(/^\s*\w+\s*=(?!=)/, '')) : last!.name
  const label = what && what.length <= 40 ? `Calculated ${what} = ${shown}` : `Calculated ${shown}`
  return { result: lines.join('\n'), ok: true, label, value: last!.value }
}

/** The answer to a question that's only a sum, or null if it needs the model after all. */
export async function instantAnswer(text: string): Promise<{ expression: string; result: string } | null> {
  const math = await loadMath()
  try {
    const { value } = evaluate(math, bareExpression(text), new Map())
    return { expression: text.trim().replace(/[?？=\s]+$/, ''), result: withSeparators(value) }
  } catch (err) {
    if (err instanceof MathError) return null
    throw err
  }
}
