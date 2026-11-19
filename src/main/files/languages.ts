import { basename, extname } from 'path'

// Which code files Otty knows, and what to call each one on its chip ("Python · 240 lines").
// Plain text (txt, md, csv, log) isn't code: it keeps the `text` kind and has no line numbers.

const BY_EXT: Record<string, string> = {
  py: 'Python', pyw: 'Python', pyi: 'Python',
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript', tsx: 'TypeScript',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less', vue: 'Vue', svelte: 'Svelte',
  rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala', groovy: 'Groovy', gradle: 'Gradle',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++', hh: 'C++', m: 'Objective-C', mm: 'Objective-C',
  cs: 'C#', fs: 'F#', swift: 'Swift', dart: 'Dart', php: 'PHP', pl: 'Perl', pm: 'Perl', lua: 'Lua', r: 'R', jl: 'Julia',
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hs: 'Haskell', clj: 'Clojure', ml: 'OCaml', zig: 'Zig', nim: 'Nim',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', fish: 'Shell', ps1: 'PowerShell', bat: 'Batch', cmd: 'Batch',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', proto: 'Protocol Buffers',
  json: 'JSON', jsonc: 'JSON', json5: 'JSON', jsonl: 'JSON Lines', ndjson: 'JSON Lines',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML', ini: 'Settings', cfg: 'Settings', conf: 'Settings', env: 'Settings',
  properties: 'Settings', tf: 'Terraform', hcl: 'Terraform', tex: 'LaTeX', cmake: 'CMake', mk: 'Makefile'
}

/** Files known by their whole name, compared without case. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'Dockerfile', containerfile: 'Dockerfile', makefile: 'Makefile', gnumakefile: 'Makefile', rakefile: 'Ruby',
  gemfile: 'Ruby', podfile: 'Ruby', brewfile: 'Ruby', procfile: 'Settings', vagrantfile: 'Ruby', jenkinsfile: 'Groovy',
  'cmakelists.txt': 'CMake', '.gitignore': 'Settings', '.gitattributes': 'Settings', '.dockerignore': 'Settings',
  '.editorconfig': 'Settings', '.npmrc': 'Settings', '.env': 'Settings', '.bashrc': 'Shell', '.zshrc': 'Shell',
  '.bash_profile': 'Shell', '.zprofile': 'Shell', '.profile': 'Shell'
}

/** The code language a file name points to, or null when it isn't a code file Otty knows. */
export function codeLanguage(name: string): string | null {
  const base = basename(name).toLowerCase()
  if (BY_NAME[base]) return BY_NAME[base]
  // `.env.local`, `.env.production`, `Dockerfile.dev`
  if (/^\.env(\.|$)/.test(base)) return 'Settings'
  if (/^(docker|container)file\./.test(base)) return 'Dockerfile'
  return BY_EXT[extname(base).slice(1)] ?? null
}
