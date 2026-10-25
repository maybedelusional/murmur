import { TOKEN_KEYS } from '@shared/themes'

const kebab = (s: string): string => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)

/** Puts a theme's tokens on the page as CSS variables (--sky-high, --ink-2, …). */
export function applyTokens(tokens: Record<string, string>): void {
  const root = document.documentElement
  for (const key of TOKEN_KEYS) {
    const v = tokens[key]
    if (v) root.style.setProperty(`--${kebab(key)}`, v)
  }
}
