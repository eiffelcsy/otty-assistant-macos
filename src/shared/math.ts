// How a question should be handled, decided locally in well under a millisecond (D-12). No mathjs here: this runs
// on every question, and it's shared with the renderer.

export type MathTier =
  /** The whole question is a sum: Otty answers by itself, with no model call. */
  | 'expression'
  /** Numbers to work out. The model uses `calculate`, without extra thinking. */
  | 'calculation'
  /** Needs reasoning as well. This turn thinks. */
  | 'problem'
  | 'none'

const UNITS_AFTER = /\b(to|in)\b/i
/** Functions a typed sum may use. Everything else in a sum has to be a unit. */
export const MATH_FUNCTIONS = ['sqrt', 'cbrt', 'abs', 'round', 'floor', 'ceil', 'exp', 'log', 'log2', 'log10', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'min', 'max', 'mean', 'median', 'std', 'variance', 'sum', 'prod', 'mod', 'gcd', 'lcm', 'pow', 'nthRoot'] as const

/** Is `at` inside a function's brackets? There, a comma separates arguments, so `mean(1,234)` isn't 1234. */
function inCall(s: string, at: number): boolean {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    if (s[i] === ')') depth++
    if (s[i] === '(' && depth-- === 0) return /[a-z0-9]/i.test(s[i - 1] ?? '')
  }
  return false
}

/** Forgiving input, because asking the model to retry costs a whole request. */
export function normalizeMath(raw: string): string {
  const s = raw
    // Before NFKC, which would turn ² into a plain 2.
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .normalize('NFKC')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/°\s*([CF])\b/g, ' deg$1')
    .replace(/°/g, ' deg')
    .replace(/\bmph\b/gi, 'mi/h')
    .replace(/\bkph\b/gi, 'km/h')
  return s
    .replace(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,])/g, (n, at: number) => (inCall(s, at) ? n : n.replace(/,/g, '')))
    .replace(/(\d+(?:\.\d+)?)\s*%\s+of\s+/gi, '($1 / 100) * ')
    .trim()
}

/** The sum itself, with polite words around it taken off. */
export function bareExpression(text: string): string {
  return normalizeMath(text)
    .replace(/^(what'?s|what’s|what is|calculate|compute|how much is|work out)\s+/i, '')
    .replace(/^=\s*/, '')
    .replace(/[?？=\s]+$/, '')
}

const NOT_A_SUM = [
  /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/, // dates
  /^\d{4}-\d{1,2}(-\d{1,2})?$/,
  /^\+?\d[\d -]{6,}$/, // phone numbers
  /^\d+\.\d+\.\d+/ // versions
]

const PROSE = /\b(plus|minus|times|tax|tip|at|and|or|for|call|the|is|an?)\b/i

function isExpression(text: string): boolean {
  const s = bareExpression(text)
  if (!/\d/.test(s) || s.length > 120 || /[$€£¥\n]/.test(s)) return false
  if (NOT_A_SUM.some((r) => r.test(s))) return false
  if (!/[+\-*/^%!]|[a-z]\(/i.test(s) && !UNITS_AFTER.test(s)) return false
  // "38 degC to degF", but not "1 in 3", which would read as inches.
  if (UNITS_AFTER.test(s) && !/\d\s*[a-z]+[a-z/^0-9 ]*\s(to|in)\s+[a-z]/i.test(s)) return false
  // Sentences go to the model. A wrong guess here costs nothing, because an unknown word fails to parse.
  return !PROSE.test(s) && (s.match(/[a-z]+/gi) ?? []).length <= 5
}

const PROBLEM = /\b(equations?|simultaneous|derivative|integral|differentiate|integrate|quadratic)\b|解方程|方程式|求解|微分|積分|积分|應用題|应用题/i
const SOLVE = /\b(solve|prove|simplify|factori[sz]e|find x|find the value)\b|證明|证明|化簡|化简/i
const UNKNOWN = /\d\s*[a-z]\b[^=]*=|\b[a-z]\s*[+\-*/^][^=]*=[^=]/i
const STORY = /\b(leaves? at|how (long|far|fast) (will|does|did|would|until)|at what (time|speed)|how old (is|was|will))\b/i
const PICTURE_WORK = /\b(solve|homework|work out|show (the|your) working)\b|這題|这题|呢題|解答|計算|计算/i
const CALCULATION = /[+*/^%]|\b(plus|minus|times|divided by|percent|split|share|tax|tip|discount|total|sum|average|mean of|how much|how many|per)\b|計|计|算|幾多|几多|百分之|打.{0,2}折/i

/** `picture` means a snip came with the question. */
export function mathTier(text: string, picture = false): MathTier {
  const s = normalizeMath(text)
  const digits = /\d/.test(s)
  if (PROBLEM.test(s) || (digits && (SOLVE.test(s) || UNKNOWN.test(s) || STORY.test(s))) || (picture && PICTURE_WORK.test(s))) return 'problem'
  if (!digits) return 'none'
  if (isExpression(text)) return 'expression'
  if (NOT_A_SUM.some((r) => r.test(bareExpression(text)))) return 'none'
  return CALCULATION.test(s) ? 'calculation' : 'none'
}
