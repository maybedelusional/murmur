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
  kind: 'read' | 'edit' | 'run' | 'say' | 'search' | 'other' | 'error' | 'system' | 'message'
}

/** One agent messaging another; the UI animates it across the sky. */
export interface AgentMessageEvent {
  fromId: string
  toId: string
  text: string
  at: number
}

// ---------- plugins and skills ----------

export interface PluginContents {
  skills: string[]
  commands: string[]
  agents: string[]
  /** Hooks and MCP servers run code on this computer. */
  hooks: boolean
  mcpServers: string[]
}

export interface MarketplacePlugin {
  /** Unique across marketplaces: `${marketplaceKey}/${name}` */
  key: string
  name: string
  marketplaceKey: string
  description?: string
  version?: string
  author?: string
  category?: string
  homepage?: string
  /** Where it's fetched from, in plain words, e.g. "github.com/acme/tool". */
  from: string
  supported: boolean
  /** Known before installing when the plugin lives inside the marketplace repo. */
  contents?: PluginContents
}

export interface Marketplace {
  key: string
  repo: string
  path?: string
  name: string
  description?: string
  official: boolean
  builtin: boolean
  plugins: MarketplacePlugin[]
  loading: boolean
  error?: string
  refreshedAt?: number
}

export interface InstalledPlugin {
  key: string
  name: string
  marketplaceKey: string
  marketplaceName: string
  description?: string
  version?: string
  enabled: boolean
  installedAt: number
  contents: PluginContents
}

export interface MySkill {
  name: string
  description: string
  body: string
}

export interface PluginsState {
  marketplaces: Marketplace[]
  installed: InstalledPlugin[]
  mySkills: MySkill[]
  /** Keys of plugins being installed or updated right now. */
  busy: string[]
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
    onMessage(cb: (m: AgentMessageEvent) => void): () => void
  }
  plugins: {
    state(): Promise<PluginsState>
    refresh(): Promise<Result>
    install(key: string, allowCode?: boolean): Promise<Result<{ enabled: boolean; runsCode: boolean }>>
    update(key: string): Promise<Result>
    uninstall(key: string): Promise<Result>
    setEnabled(key: string, enabled: boolean): Promise<Result>
    addMarketplace(repo: string): Promise<Result>
    removeMarketplace(key: string): Promise<Result>
    saveSkill(skill: MySkill, previousName?: string): Promise<Result>
    deleteSkill(name: string): Promise<Result>
    onChange(cb: (s: PluginsState) => void): () => void
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
