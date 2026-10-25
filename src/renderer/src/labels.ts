import type { AccessMode, Role } from '@shared/types'

export const MODE_SHORT: Record<AccessMode, string> = {
  ask: 'Ask',
  edits: 'Edits',
  auto: 'Auto',
  bypass: 'No checks'
}

export const MODE_LONG: Record<AccessMode, { title: string; desc: string }> = {
  ask: { title: 'Ask before every action', desc: 'You approve each file change and command.' },
  edits: { title: 'Let it edit files', desc: 'File changes go through. Commands still ask.' },
  auto: { title: 'Auto', desc: 'Acts on its own. A safety check blocks risky actions.' },
  bypass: { title: 'Skip all checks', desc: 'No safety check at all. Only Murmur’s own rules still apply.' }
}

export const ROLES: Array<{ id: Role; label: string }> = [
  { id: 'planner', label: 'Planner' },
  { id: 'builder', label: 'Builder' },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'tester', label: 'Tester' },
  { id: 'custom', label: 'Custom' }
]

export function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
