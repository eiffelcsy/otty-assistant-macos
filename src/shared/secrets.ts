// Hides things that look like keys, tokens and passwords before they're sent: in attached files (in the file reader,
// D-29), and in highlighted text, typed words and pages read (D-32). Pure, so main, the worker and tests share it.
// It's a safety net, not a promise: friendly copy says "things that looked like keys", never "all your keys".

export const HIDDEN = '[hidden key]'

/** Shapes that are secrets wherever they appear. */
const SHAPES: RegExp[] = [
  // PEM private keys, the whole block
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
  // OpenAI, Anthropic, DeepSeek and other `sk-` keys
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
  // AWS access key ids
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  // Slack tokens
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  // Stripe live and test secret keys
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  // Google API keys
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  // JSON Web Tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // Bearer tokens in headers
  /(?<=\bBearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g,
  // Passwords in addresses: scheme://user:password@host
  /(?<=[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]{3,}(?=@)/gi
]

/**
 * A name that says its value is a secret. The secret word ends the name or is followed by a separator, so
 * `DB_PASSWORD`, `api-key` and `SECRET_KEY_BASE` count, but `tokenizer`, `secretary` and `author` don't.
 */
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*?(?:passwords?|passwd|secrets?|tokens?|api[_-]?keys?|apikeys?|private[_-]?keys?|access[_-]?keys?|client[_-]?secrets?|credentials?)(?:[_.-][A-Za-z0-9]+)*`

/**
 * `NAME=value`, `NAME: value` and `"name": "value"`, where the name says it's a secret and the value is a literal.
 * Code like `password = input()` or `token = get_token()` is left alone, because only quoted strings and bare words
 * (as in `.env` files) count, and a bare word must look like a value rather than a name in code.
 */
const ASSIGNED = new RegExp(
  String.raw`(^|[\s{,(;])((?:export\s+)?["']?${SECRET_NAME}["']?\s*(?::|=|:=|=>)\s*)(?:"([^"\n]{4,})"|'([^'\n]{4,})'|([^\s"'#,;)}{]{6,}))`,
  'gim'
)

/** Bare `.env` words that are clearly not secrets. */
const NOT_SECRET = /^(?:true|false|null|none|nil|undefined|changeme|example|placeholder|your[_-].*|<.*>|\$\{.*\}|\$[A-Z_]+|xxx+|\*+)$/i

/** A bare word that reads like code (a call, an attribute, a variable) rather than a value. */
const LOOKS_LIKE_CODE = /[()[\]]|^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+$|^(?:self|this|os|process|env|config|settings|request|args|options|props)\b/i

export interface Masked {
  text: string
  /** How many things were hidden. */
  hidden: number
}

/**
 * `shapesOnly` is for the user's own typed words: a key pasted by mistake has a shape, but "my password is…" may be
 * meant, so `NAME=value` is left as they wrote it.
 */
export function maskSecrets(text: string, opts: { shapesOnly?: boolean } = {}): Masked {
  let hidden = 0
  let out = text
  for (const re of SHAPES) {
    out = out.replace(re, () => {
      hidden++
      return HIDDEN
    })
  }
  if (opts.shapesOnly) return { text: out, hidden }
  out = out.replace(ASSIGNED, (all, lead: string, key: string, dq?: string, sq?: string, bare?: string) => {
    const value = dq ?? sq ?? bare ?? ''
    if (value.includes(HIDDEN)) return all
    if (bare !== undefined && (NOT_SECRET.test(bare) || LOOKS_LIKE_CODE.test(bare) || /^\d+$/.test(bare))) return all
    if (NOT_SECRET.test(value)) return all
    hidden++
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : ''
    return `${lead}${key}${quote}${HIDDEN}${quote}`
  })
  return { text: out, hidden }
}
