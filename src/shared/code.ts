// Does highlighted text look like code? Then the quick actions offer Explain this code, Find problems and
// Add comments first. Pure, shared by main and renderer, and deliberately cautious: a wrong "code" guess
// hides Proofread and Translate, so prose with a stray bracket stays prose.

/** Apps where a highlight is almost always code or a terminal's output. Matched on the app's name. */
const CODE_APPS =
  /^(?:Visual Studio Code|Code|Code - Insiders|VSCodium|Cursor|Windsurf|Zed|Xcode|Nova|BBEdit|Sublime Text|TextMate|CotEditor|Terminal|iTerm2?|Warp|Ghostty|kitty|Alacritty|WezTerm|PyCharm|IntelliJ IDEA|WebStorm|GoLand|CLion|RubyMine|PhpStorm|Rider|DataGrip|Android Studio|Fleet|RStudio|Positron|Spyder|MATLAB)\b/i

/** A line that reads like code rather than prose. */
const CODE_LINE = new RegExp(
  [
    String.raw`^\s*(?:def|class|import|from\s+\S+\s+import|function|const|let|var|return|if\s*\(|for\s*\(|while\s*\(|elif|else:|try:|except|catch|finally|async|await|export|public|private|protected|static|fn|func|package|#include|using|namespace|struct|enum|interface|type\s+\w+\s*=|SELECT|INSERT|UPDATE|DELETE|CREATE)\b`,
    String.raw`[;{}]\s*$`,
    String.raw`^\s*[}\])]`,
    String.raw`=>|==|!=|<=|>=|\+=|&&|\|\||::|->`,
    String.raw`^\s*(?:#|//|/\*|\*)\s`,
    String.raw`\w+\([^)]*\)\s*[:{;]?\s*$`,
    String.raw`^\s*[\w.\[\]"']+\s*=\s*\S`,
    String.raw`^\s*@\w+`,
    String.raw`^\s*\$\s+\S`,
    String.raw`^Traceback \(most recent call last\)|^\s+at \S+ \(|^\w*(?:Error|Exception):`
  ].join('|')
)

/** True when the text looks like code or a stack trace, or comes from a code editor or terminal. */
export function looksLikeCode(text: string, appName?: string): boolean {
  const t = text.trim()
  if (!t) return false
  const lines = t.split('\n').filter((l) => l.trim())
  if (appName && CODE_APPS.test(appName) && (lines.length > 1 || CODE_LINE.test(t))) return true
  if (lines.length < 2) return false
  const codeish = lines.filter((l) => CODE_LINE.test(l)).length
  // Indented lines are a strong hint in Python and YAML, but only alongside other code lines.
  const indented = lines.filter((l) => /^(?: {2,}|\t)\S/.test(l)).length
  return codeish / lines.length >= 0.5 || (codeish / lines.length >= 0.3 && indented / lines.length >= 0.3)
}

/** Undoes Otty's own `  42│ ` line numbers, in case a model copied them into an answer's code. */
export function stripLineNumbers(code: string): string {
  const lines = code.split('\n')
  const numbered = /^\s*\d+│ ?/
  if (!lines.filter((l) => l.trim()).every((l) => numbered.test(l))) return code
  return lines.map((l) => l.replace(numbered, '')).join('\n')
}
