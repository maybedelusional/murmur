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
  /** Murmur themes packaged in the plugin (themes/<name>/theme.json). */
  themes?: string[]
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
  /** Estimated spend so far (an estimate, not a bill). */
  costUsd: number
  /** The agent pauses itself when it reaches this. */
  budgetUsd?: number
  /** Set when the agent stopped because it hit its budget. */
  overBudget?: boolean
  error?: string
  createdAt: number
  /** Agents started together from a team recipe share a team. */
  teamId?: string
  teamName?: string
  /** This agent may start new agents (with the person's approval). */
  canStartAgents?: boolean
  /** Name of the agent that started this one, if any. */
  startedBy?: string
}

export interface NewAgentInput {
  name?: string
  role: Role
  task: string
  mode: AccessMode
  budgetUsd?: number
}

// ---------- team recipes ----------

export interface RecipeMember {
  role: Role
  name?: string
  mode: AccessMode
  /** What this member does in the team, added to the shared task. */
  brief: string
  /** Lets this member start more agents, each one approved by you. */
  canStartAgents?: boolean
}

export interface Recipe {
  id: string
  name: string
  description: string
  members: RecipeMember[]
  builtin?: boolean
}

export interface StartTeamInput {
  recipeId: string
  task: string
  budgetUsd?: number
}

// ---------- review ----------

export interface DiffLine {
  kind: 'context' | 'add' | 'del'
  oldNo?: number
  newNo?: number
  text: string
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface FileDiff {
  file: string
  oldFile?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  binary: boolean
  /** Very large files are summarised instead of shown in full. */
  tooLarge: boolean
  added: number
  removed: number
  hunks: DiffHunk[]
}

// ---------- themes ----------

export interface ThemeBackground {
  kind: 'image' | 'video'
  /** URL the UI can load (murmur-media://...). */
  url: string
  /** How much to darken it behind text, 0–0.8. */
  dim: number
  /** Video plays faster while agents are busy. */
  reactive: boolean
}

export interface ThemeInfo {
  id: string
  name: string
  /** Where it comes from: built in, one of your own, or a plugin. */
  source: 'builtin' | 'mine' | 'plugin'
  pluginName?: string
  tokens: Record<string, string>
  /** Flat sky bands and horizon (the Dusk look). Off when a background replaces them. */
  bands: boolean
  background?: ThemeBackground
}

export interface ThemeDraft {
  id?: string
  name: string
  tokens: Record<string, string>
  bands: boolean
  /** A new file to copy in, or keep the current one. */
  backgroundFile?: string | null
  dim: number
  reactive: boolean
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
  /** Budget new agents get unless you set one; 0 means no limit. */
  defaultBudgetUsd: number
  notifyApprovals: boolean
  notifyFinished: boolean
  notifyErrors: boolean
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
    /** A notification was clicked: show that agent. */
    onFocus(cb: (id: string) => void): () => void
    setBudget(id: string, budgetUsd: number | null): Promise<Result>
    diff(id: string): Promise<Result<FileDiff[]>>
    startTeam(input: StartTeamInput): Promise<Result<AgentSnapshot[]>>
  }
  recipes: {
    list(): Promise<Recipe[]>
    save(recipe: Recipe): Promise<Result<Recipe>>
    remove(id: string): Promise<Result>
  }
  themes: {
    list(): Promise<ThemeInfo[]>
    use(id: string): Promise<Result<ThemeInfo>>
    save(draft: ThemeDraft): Promise<Result<ThemeInfo>>
    remove(id: string): Promise<Result>
    chooseBackground(): Promise<string | null>
    onChange(cb: (themes: ThemeInfo[], current: ThemeInfo) => void): () => void
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
