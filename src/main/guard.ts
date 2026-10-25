import { isAbsolute, relative, resolve } from 'node:path'
import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'

/**
 * Rules Murmur enforces on every agent, in every access mode (hooks still run
 * when permission checks are skipped). Agents work on their own branch in
 * their own folder; publishing and merging is the person's call.
 */
const BLOCKED_COMMANDS: Array<[RegExp, string]> = [
  [/\bgit\s+push\b/i, 'Agents in Murmur never push. Merging and publishing are done from Murmur by you.'],
  [/\bgit\s+(checkout|switch)\s+(-[a-z]\s+)?(main|master)\b/i, 'Agents stay on their own branch.'],
  [/\bgit\s+branch\s+(-D|--delete\s+--force)\b/, 'Agents may not force-delete branches.'],
  [/\bgit\s+worktree\s+remove\b/i, 'Murmur manages worktrees itself.'],
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|[A-Za-z]:[\\/])(\s|$)/i, 'Deleting a whole drive or home folder is blocked.'],
  [/\b(format|diskpart)\b/i, 'Disk tools are blocked.']
]

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function deny(reason: string): ReturnType<HookCallback> {
  return Promise.resolve({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  })
}

export function makeGuard(folder: string, mainRepo: string): HookCallback {
  const inside = (p: string): boolean => {
    const abs = isAbsolute(p) ? p : resolve(folder, p)
    const rel = relative(folder, abs)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }

  return (input) => {
    if (input.hook_event_name !== 'PreToolUse') return Promise.resolve({})
    const { tool_name, tool_input } = input as PreToolUseHookInput
    const args = (tool_input ?? {}) as Record<string, unknown>

    if (tool_name === 'Bash' || tool_name === 'PowerShell') {
      const cmd = String(args.command ?? '')
      for (const [pattern, reason] of BLOCKED_COMMANDS) {
        if (pattern.test(cmd)) return deny(reason)
      }
      const lower = cmd.toLowerCase().replace(/\\/g, '/')
      if (lower.includes(mainRepo.toLowerCase().replace(/\\/g, '/'))) {
        return deny(`Work only inside your own folder (${folder}), not the main project folder.`)
      }
    }

    if (FILE_TOOLS.has(tool_name)) {
      const path = String(args.file_path ?? args.notebook_path ?? '')
      if (path && !inside(path)) {
        return deny(`You can only change files inside your own folder: ${folder}`)
      }
    }

    return Promise.resolve({})
  }
}
