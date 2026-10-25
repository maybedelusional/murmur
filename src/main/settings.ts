import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Settings } from '@shared/types'

const file = (): string => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    // Keep worktrees on a short path on Windows (long paths break node_modules).
    worktreeRoot: process.platform === 'win32' ? 'C:\\cw' : join(homedir(), '.murmur', 'worktrees'),
    allowBypass: false,
    hideAutoCaution: false,
    theme: 'dusk'
  }
}

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = { ...defaults(), ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    cache = defaults()
  }
  return cache!
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
  return cache
}
