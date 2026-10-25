// Types shared by the main process, the preload bridge and the UI.

export type Role = 'planner' | 'builder' | 'reviewer' | 'tester' | 'custom'

/**
 * How much an agent asks before acting.
 * ask    → Claude Code "default": you approve each action
 * edits  → "acceptEdits": file changes go through, commands ask
 * auto   → "auto": a safety classifier decides (caution)
 * bypass → "bypassPermissions": no checks at all (danger, opt-in in Settings)
 */
export type AccessMode = 'ask' | 'edits' | 'auto' | 'bypass'

export type AgentStatus =
  | 'starting'
  | 'working'
  | 'waiting' // waiting for the user to approve something
  | 'idle' // finished a turn, ready for more
  | 'paused'
  | 'error'
  | 'merged'

export interface ActivityItem {
  at: number
  text: string
  kind: 'read' | 'edit' | 'run' | 'say' | 'search' | 'other' | 'error' | 'system'
}

export interface FileChange {
  file: string
  added: number
  removed: number
  /** Other agents whose branches also change this file. */
  sharedWith: string[]
}

export interface ApprovalRequest {
  id: string
  agentId: string
  title: string
  detail?: string
  toolName: string
  at: number
}

export interface AgentSnapshot {
  id: string
  name: string
  role: Role
  task: string
  mode: AccessMode
  status: AgentStatus
  statusText: string
  branch: string
  folder: string
  activity: ActivityItem[]
  files: FileChange[]
  linesAdded: number
  linesRemoved: number
  costUsd: number
  error?: string
  createdAt: number
}

export interface NewAgentInput {
  name?: string
  role: Role
  task: string
  mode: AccessMode
}

export interface ProjectInfo {
  path: string
  name: string
  branch: string
}

export interface Settings {
  /** Where agent worktrees go. Short paths avoid Windows' 260-char limit. */
  worktreeRoot: string
  /** "Skip all checks" mode is hidden unless this is on. */
  allowBypass: boolean
  /** Don't show the auto-mode caution again. */
  hideAutoCaution: boolean
  lastProject?: string
  theme: string
}

export interface NowPlaying {
  available: boolean
  title?: string
  artist?: string
  playing?: boolean
  app?: string
}

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string }

/** The API the preload script exposes to the UI as `window.murmur`. */
export interface MurmurApi {
  platform: string
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
  project: {
    current(): Promise<ProjectInfo | null>
    choose(): Promise<Result<ProjectInfo | null>>
  }
  agents: {
    list(): Promise<AgentSnapshot[]>
    create(input: NewAgentInput): Promise<Result<AgentSnapshot>>
    send(id: string, text: string): Promise<Result>
    pause(id: string): Promise<Result>
    resume(id: string): Promise<Result>
    pauseAll(): Promise<Result>
    setMode(id: string, mode: AccessMode): Promise<Result>
    merge(id: string): Promise<Result<string>>
    discard(id: string): Promise<Result>
    openTerminal(id: string): Promise<Result>
    answer(approvalId: string, allow: boolean): Promise<Result>
    onUpdate(cb: (agents: AgentSnapshot[], approvals: ApprovalRequest[]) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  media: {
    onChange(cb: (now: NowPlaying) => void): () => void
    command(cmd: 'toggle' | 'next' | 'previous'): Promise<void>
  }
  updates: {
    onChange(cb: (state: UpdateState) => void): () => void
    restartToUpdate(): void
  }
}
