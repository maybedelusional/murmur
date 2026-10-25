/**
 * A theme is a flat set of tokens. Everything in the UI reads these as CSS
 * variables, so a custom theme only has to supply new values (later: plus
 * optional animated layers). Dusk is the built-in reference theme.
 */
export interface ThemeTokens {
  /** App chrome */
  ink: string
  ink2: string
  ink3: string
  line: string
  text: string
  muted: string
  faint: string
  accent: string
  accentBorder: string
  accentText: string
  danger: string
  dangerBorder: string
  /** The sky the agents fly in */
  skyHigh: string
  sky: string
  skyLow: string
  horizon: string
  treeline: string
  bird: string
  onSky: string
  onSkyStrong: string
  onSkyAccent: string
}

export interface Theme {
  id: string
  name: string
  tokens: ThemeTokens
}

export const dusk: Theme = {
  id: 'dusk',
  name: 'Dusk',
  tokens: {
    ink: '#1A1622',
    ink2: '#221D2C',
    ink3: '#2C2637',
    line: '#4A4257',
    text: '#E7E1EC',
    muted: '#A69EB4',
    faint: '#6F667F',
    accent: '#E8A47C',
    accentBorder: '#8A5B43',
    accentText: '#F0C9B1',
    danger: '#F08A80',
    dangerBorder: '#8C4A45',
    skyHigh: '#958CAA',
    sky: '#A79FBA',
    skyLow: '#C7B2BF',
    horizon: '#E8A47C',
    treeline: '#1A1622',
    bird: '#1A1622',
    onSky: '#2E2838',
    onSkyStrong: '#1A1622',
    onSkyAccent: '#5E220C'
  }
}

const kebab = (s: string): string => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${kebab(key)}`, value)
  }
  root.dataset.theme = theme.id
}
