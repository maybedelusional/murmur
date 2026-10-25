/**
 * Theme tokens. Everything in the UI reads these as CSS variables (camelCase
 * here, --kebab-case in CSS), so a theme only has to supply new values.
 */
export const TOKEN_KEYS = [
  'ink',
  'ink2',
  'ink3',
  'line',
  'text',
  'muted',
  'faint',
  'accent',
  'accentBorder',
  'accentText',
  'danger',
  'dangerBorder',
  'skyHigh',
  'sky',
  'skyLow',
  'horizon',
  'treeline',
  'bird',
  'onSky',
  'onSkyStrong',
  'onSkyAccent'
] as const

export type TokenKey = (typeof TOKEN_KEYS)[number]
export type ThemeTokens = Record<TokenKey, string>

/** The handful of tokens the theme editor shows, with plain names. */
export const EDITABLE_TOKENS: Array<{ key: TokenKey; label: string }> = [
  { key: 'skyHigh', label: 'Upper sky' },
  { key: 'sky', label: 'Sky' },
  { key: 'skyLow', label: 'Lower sky' },
  { key: 'horizon', label: 'Horizon' },
  { key: 'treeline', label: 'Tree line' },
  { key: 'bird', label: 'Birds' },
  { key: 'onSkyStrong', label: 'Names on the sky' },
  { key: 'onSky', label: 'Status on the sky' },
  { key: 'ink', label: 'Panels' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Quiet text' },
  { key: 'accent', label: 'Accent' }
]

export const DUSK: ThemeTokens = {
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

export const NIGHT: ThemeTokens = {
  ink: '#0D0F1C',
  ink2: '#151829',
  ink3: '#1F2338',
  line: '#3A3F5C',
  text: '#E6E6F0',
  muted: '#A0A4BE',
  faint: '#686D8A',
  accent: '#F0B48C',
  accentBorder: '#80583F',
  accentText: '#F4D2BC',
  danger: '#F08A80',
  dangerBorder: '#8C4A45',
  skyHigh: '#0F1430',
  sky: '#151B3C',
  skyLow: '#1E2550',
  horizon: '#2C3A6B',
  treeline: '#06070D',
  bird: '#DCD8EC',
  onSky: '#B7B4D0',
  onSkyStrong: '#EEECF7',
  onSkyAccent: '#F4BE9A'
}

/** Fills in any missing token from Dusk, and drops anything that isn't a plain colour. */
export function cleanTokens(input: Record<string, unknown> | undefined, base: ThemeTokens = DUSK): ThemeTokens {
  const out = { ...base }
  if (!input) return out
  for (const key of TOKEN_KEYS) {
    const v = input[key]
    if (typeof v === 'string' && isColor(v)) out[key] = v.trim()
  }
  return out
}

export function isColor(v: string): boolean {
  const s = v.trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(s) || /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/.test(s)
}
