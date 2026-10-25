import { app, shell, type WebContents } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, basename, resolve as resolvePath } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Query,
  SDKMessage,
  SDKUserMessage,
  PermissionMode,
  PermissionResult,
  CanUseTool
} from '@anthropic-ai/claude-agent-sdk'
import type {
  AccessMode,
  ActivityItem,
  AgentSnapshot,
  ApprovalRequest,
  NewAgentInput,
  Role
} from '@shared/types'
import { IPC } from '@shared/ipc'
import { addWorktree, changedFiles, commitAll, inspectRepo, mergeBranch, removeWorktree, type RepoInfo } from './git'
import { makeGuard } from './guard'
import { getSettings } from './settings'

const MODE_MAP: Record<AccessMode, PermissionMode> = {
  ask: 'default',
  edits: 'acceptEdits',
  auto: 'auto',
  bypass: 'bypassPermissions'
}

const ROLE_NAMES: Record<Role, string> = {
  planner: 'Planner',
  builder: 'Builder',
  reviewer: 'Reviewer',
  tester: 'Tester',
  custom: 'Agent'
}

const ROLE_BRIEF: Record<Role, string> = {
  planner:
    'Your role is planner. Break the task into small, independent pieces of work that separate builder agents could do in parallel without touching the same files. Write the plan to PLAN.md in your folder. Do not implement the work yourself.',
  builder:
    'Your role is builder. Implement the task in your folder, keep changes focused on it, and run the relevant tests before you finish. Commit your work with clear messages.',
  reviewer:
    'Your role is reviewer. Review the changes on the branches you are asked about (use git diff and git log), point out bugs, missing tests and risky changes, and fix small issues yourself.',
  tester:
    'Your role is tester. Write and run tests for the task. Report clearly what passes, what fails and why.',
  custom: ''
}

function rolePrompt(a: AgentSnapshot): string {
  return [
    `You are "${a.name}", one of several Claude agents working in parallel inside Murmur.`,
    `You work in your own git worktree at ${a.folder} on branch ${a.branch}. Other agents have their own folders and branches.`,
    'Only change files inside your folder. Never push, never switch branches, and never touch the main project folder. The person merges your branch from Murmur when they are happy with it.',
    ROLE_BRIEF[a.role]
  ]
    .filter(Boolean)
    .join('\n')
}

/** An async queue of user messages: the agent's session stays open between turns. */
class Inbox implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(text: string): void {
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      origin: { kind: 'human' }
    }
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: msg, done: false })
    } else this.items.push(msg)
  }

  close(): void {
    this.closed = true
    if (this.waiting) this.waiting({ value: undefined, done: true })
    this.waiting = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((r) => (this.waiting = r))
      }
    }
  }
}

interface Agent {
  snap: AgentSnapshot
  repo: string
  base: string
  sessionId?: string
  q?: Query
  inbox?: Inbox
  abort?: AbortController
  pausing?: boolean
  diffTimer?: NodeJS.Timeout
}

interface PendingApproval {
  request: ApprovalRequest
  resolve: (r: PermissionResult) => void
}

interface SavedAgent {
  snap: AgentSnapshot
  repo: string
  base: string
  sessionId?: string
}

const MAX_ACTIVITY = 200

function claudeBinary(): string | undefined {
  if (!app.isPackaged) return undefined
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'
  try {
    const p = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${exe}`)
    return p.replace('app.asar', 'app.asar.unpacked')
  } catch {
    return undefined
  }
}

let sdkPromise: Promise<typeof import('@anthropic-ai/claude-agent-sdk')> | null = null
const loadSdk = (): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> =>
  (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

export class AgentManager {
  private agents = new Map<string, Agent>()
  private approvals = new Map<string, PendingApproval>()
  private repo: RepoInfo | null = null
  private web: WebContents | null = null
  private emitTimer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.load()
  }

  attach(web: WebContents): void {
    this.web = web
  }

  get project(): RepoInfo | null {
    return this.repo
  }

  async openProject(path: string): Promise<RepoInfo> {
    this.repo = await inspectRepo(path)
    this.emit()
    return this.repo
  }

  list(): AgentSnapshot[] {
    if (!this.repo) return []
    const root = this.repo.root
    return [...this.agents.values()]
      .filter((a) => a.repo === root)
      .sort((x, y) => x.snap.createdAt - y.snap.createdAt)
      .map((a) => a.snap)
  }

  pendingApprovals(): ApprovalRequest[] {
    const ids = new Set(this.list().map((a) => a.id))
    return [...this.approvals.values()].map((p) => p.request).filter((r) => ids.has(r.agentId))
  }

  // ---------- lifecycle ----------

  async create(input: NewAgentInput): Promise<AgentSnapshot> {
    if (!this.repo) throw new Error('Open a project first.')
    if (!input.task.trim()) throw new Error('Tell the agent what to do.')
    const settings = getSettings()
    if (input.mode === 'bypass' && !settings.allowBypass) {
      throw new Error('"Skip all checks" is turned off. Turn it on in Settings, under Advanced.')
    }

    const name = input.name?.trim() || this.nextName(input.role)
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'
    let slug = baseSlug
    let folder = join(settings.worktreeRoot, this.repo.name, slug)
    for (let i = 2; existsSync(folder) || [...this.agents.values()].some((a) => a.snap.folder === folder); i++) {
      slug = `${baseSlug}-${i}`
      folder = join(settings.worktreeRoot, this.repo.name, slug)
    }
    const branch = `murmur/${slug}-${Date.now().toString(36).slice(-4)}`
    const base = await addWorktree(this.repo.root, folder, branch)

    const snap: AgentSnapshot = {
      id: randomUUID(),
      name,
      role: input.role,
      task: input.task.trim(),
      mode: input.mode,
      status: 'starting',
      statusText: 'Starting',
      branch,
      folder,
      activity: [],
      files: [],
      linesAdded: 0,
      linesRemoved: 0,
      costUsd: 0,
      createdAt: Date.now()
    }
    const agent: Agent = { snap, repo: this.repo.root, base }
    this.agents.set(snap.id, agent)
    this.log(agent, 'system', `Created its own folder on branch ${branch}`)
    this.start(agent, snap.task)
    return snap
  }

  private nextName(role: Role): string {
    const base = ROLE_NAMES[role]
    const taken = new Set([...this.agents.values()].map((a) => a.snap.name))
    if (role === 'planner' || role === 'reviewer' || role === 'tester') {
      if (!taken.has(base)) return base
    }
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (!taken.has(`${base} ${letter}`)) return `${base} ${letter}`
    }
    return `${base} ${taken.size + 1}`
  }

  private start(agent: Agent, firstMessage: string): void {
    const inbox = new Inbox()
    const abort = new AbortController()
    agent.inbox = inbox
    agent.abort = abort
    inbox.push(firstMessage)
    void this.run(agent, inbox, abort)
  }

  private async run(agent: Agent, inbox: Inbox, abort: AbortController): Promise<void> {
    const a = agent.snap
    try {
      const sdk = await loadSdk()
      const canUseTool: CanUseTool = (toolName, input, opts) => this.ask(agent, toolName, input, opts)
      const q = sdk.query({
        prompt: inbox,
        options: {
          cwd: a.folder,
          permissionMode: MODE_MAP[a.mode],
          allowDangerouslySkipPermissions: getSettings().allowBypass,
          canUseTool,
          hooks: { PreToolUse: [{ hooks: [makeGuard(a.folder, resolvePath(agent.repo))] }] },
          systemPrompt: { type: 'preset', preset: 'claude_code', append: rolePrompt(a) },
          pathToClaudeCodeExecutable: claudeBinary(),
          abortController: abort,
          resume: agent.sessionId,
          stderr: (d) => console.error(`[${a.name}]`, d.trimEnd())
        }
      })
      agent.q = q
      this.setStatus(agent, 'working', 'Thinking')
      for await (const msg of q) this.handle(agent, msg)
      if (agent.snap.status !== 'merged') this.setStatus(agent, 'paused', 'Session ended')
    } catch (e) {
      if (abort.signal.aborted) return
      const message = e instanceof Error ? e.message : String(e)
      agent.snap.error = message
      this.log(agent, 'error', message)
      this.setStatus(agent, 'error', friendlyError(message))
    } finally {
      if (agent.inbox === inbox) {
        agent.q = undefined
        agent.inbox = undefined
      }
      this.dropApprovals(agent.snap.id)
    }
  }

  private handle(agent: Agent, msg: SDKMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') agent.sessionId = msg.session_id
        break
      case 'assistant': {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            this.log(agent, 'say', block.text.trim().slice(0, 400))
          } else if (block.type === 'tool_use') {
            const d = describe(block.name, (block.input ?? {}) as Record<string, unknown>, agent.snap.folder)
            this.log(agent, d.kind, d.done)
            if (agent.snap.status !== 'waiting') this.setStatus(agent, 'working', d.doing)
          }
        }
        break
      }
      case 'user':
        // Tool results: refresh the file list after anything that may have changed files.
        this.scheduleDiff(agent)
        break
      case 'result': {
        agent.snap.costUsd += 'total_cost_usd' in msg ? (msg.total_cost_usd ?? 0) : 0
        this.scheduleDiff(agent, 0)
        if (agent.pausing) {
          agent.pausing = false
          this.setStatus(agent, 'paused', 'Paused')
        } else if (msg.subtype === 'success') {
          this.setStatus(agent, 'idle', 'Done, waiting for you')
        } else {
          this.setStatus(agent, 'idle', 'Stopped before finishing')
        }
        break
      }
      default:
        break
    }
  }

  // ---------- approvals ----------

  private ask(
    agent: Agent,
    toolName: string,
    input: Record<string, unknown>,
    opts: Parameters<CanUseTool>[2]
  ): Promise<PermissionResult> {
    const d = describe(toolName, input, agent.snap.folder)
    const request: ApprovalRequest = {
      id: randomUUID(),
      agentId: agent.snap.id,
      title: opts.title ?? `${agent.snap.name} wants to ${d.ask}`,
      detail: typeof input.command === 'string' ? input.command : undefined,
      toolName,
      at: Date.now()
    }
    const prevText = agent.snap.statusText
    this.setStatus(agent, 'waiting', 'Waiting for you')
    return new Promise<PermissionResult>((resolve) => {
      const done = (r: PermissionResult): void => {
        this.approvals.delete(request.id)
        if (agent.snap.status === 'waiting' && !this.hasApprovals(agent.snap.id)) {
          this.setStatus(agent, 'working', prevText)
        }
        this.emit()
        resolve(r)
      }
      this.approvals.set(request.id, { request, resolve: done })
      opts.signal.addEventListener('abort', () => done({ behavior: 'deny', message: 'Cancelled.' }))
      this.emit()
    })
  }

  answer(approvalId: string, allow: boolean): void {
    const p = this.approvals.get(approvalId)
    if (!p) throw new Error('That request is no longer waiting.')
    const agent = this.agents.get(p.request.agentId)
    if (agent) this.log(agent, 'system', allow ? 'You allowed it' : 'You said no')
    p.resolve(allow ? { behavior: 'allow' } : { behavior: 'deny', message: 'The person declined this action. Try another way or ask them.' })
  }

  private hasApprovals(agentId: string): boolean {
    return [...this.approvals.values()].some((p) => p.request.agentId === agentId)
  }

  private dropApprovals(agentId: string): void {
    for (const p of [...this.approvals.values()]) {
      if (p.request.agentId === agentId) p.resolve({ behavior: 'deny', message: 'Session ended.' })
    }
  }

  // ---------- controls ----------

  private get(id: string): Agent {
    const a = this.agents.get(id)
    if (!a) throw new Error('That agent no longer exists.')
    return a
  }

  send(id: string, text: string): void {
    const agent = this.get(id)
    if (agent.snap.status === 'merged') throw new Error('This agent was merged. Start a new one for more work.')
    this.log(agent, 'system', `You: ${text}`)
    if (agent.inbox) agent.inbox.push(text)
    else this.start(agent, text)
    this.setStatus(agent, 'working', 'Thinking')
  }

  async pause(id: string): Promise<void> {
    const agent = this.get(id)
    if (!agent.q || agent.snap.status === 'idle') {
      this.setStatus(agent, 'paused', 'Paused')
      return
    }
    agent.pausing = true
    this.dropApprovals(id)
    await agent.q.interrupt()
  }

  resume(id: string): void {
    this.send(id, 'Continue where you left off.')
  }

  async pauseAll(): Promise<void> {
    await Promise.all(this.list().filter((a) => a.status === 'working' || a.status === 'waiting').map((a) => this.pause(a.id)))
  }

  async setMode(id: string, mode: AccessMode): Promise<void> {
    const agent = this.get(id)
    if (mode === 'bypass' && !getSettings().allowBypass) {
      throw new Error('"Skip all checks" is turned off. Turn it on in Settings, under Advanced.')
    }
    if (agent.q) await agent.q.setPermissionMode(MODE_MAP[mode])
    agent.snap.mode = mode
    this.log(agent, 'system', `Access changed to ${modeLabel(mode)}`)
    this.emit()
  }

  async merge(id: string): Promise<string> {
    const agent = this.get(id)
    if (agent.snap.status === 'working' || agent.snap.status === 'waiting') {
      throw new Error(`${agent.snap.name} is still working. Pause it or wait until it's done, then merge.`)
    }
    await commitAll(agent.snap.folder, `${agent.snap.name}: ${agent.snap.task.split('\n')[0].slice(0, 70)}`)
    const target = await mergeBranch(agent.repo, agent.snap.branch)
    this.log(agent, 'system', `Merged into ${target}`)
    this.setStatus(agent, 'merged', `Merged into ${target}`)
    return target
  }

  async discard(id: string): Promise<void> {
    const agent = this.get(id)
    agent.abort?.abort()
    agent.inbox?.close()
    this.dropApprovals(id)
    await removeWorktree(agent.repo, agent.snap.folder, agent.snap.branch)
    this.agents.delete(id)
    this.emit()
  }

  async openTerminal(id: string): Promise<void> {
    const folder = this.get(id).snap.folder
    if (process.platform === 'win32') {
      const wt = spawn('wt.exe', ['-d', folder], { detached: true, stdio: 'ignore' })
      wt.on('error', () => {
        spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${folder}"`], { detached: true, stdio: 'ignore', shell: false }).unref()
      })
      wt.unref()
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', folder], { detached: true, stdio: 'ignore' }).unref()
    } else {
      await shell.openPath(folder)
    }
  }

  shutdown(): void {
    for (const a of this.agents.values()) {
      a.abort?.abort()
      a.inbox?.close()
    }
    this.saveNow()
  }

  // ---------- state ----------

  private setStatus(agent: Agent, status: AgentSnapshot['status'], text: string): void {
    agent.snap.status = status
    agent.snap.statusText = text
    this.emit()
  }

  private log(agent: Agent, kind: ActivityItem['kind'], text: string): void {
    agent.snap.activity.push({ at: Date.now(), kind, text })
    if (agent.snap.activity.length > MAX_ACTIVITY) agent.snap.activity.splice(0, agent.snap.activity.length - MAX_ACTIVITY)
    this.emit()
  }

  private scheduleDiff(agent: Agent, delay = 800): void {
    clearTimeout(agent.diffTimer)
    agent.diffTimer = setTimeout(() => void this.refreshDiff(agent), delay)
  }

  private async refreshDiff(agent: Agent): Promise<void> {
    if (!existsSync(agent.snap.folder)) return
    try {
      const files = await changedFiles(agent.snap.folder, agent.base)
      agent.snap.files = files.map((f) => ({ ...f, sharedWith: [] }))
      agent.snap.linesAdded = files.reduce((s, f) => s + f.added, 0)
      agent.snap.linesRemoved = files.reduce((s, f) => s + f.removed, 0)
      this.markShared()
      this.emit()
    } catch {
      /* folder busy; try again on the next change */
    }
  }

  /** Flags files that more than one live agent is changing, so clashes show up before merging. */
  private markShared(): void {
    const live = [...this.agents.values()].filter((a) => a.snap.status !== 'merged')
    for (const a of live) {
      for (const f of a.snap.files) {
        f.sharedWith = live.filter((o) => o !== a && o.snap.files.some((g) => g.file === f.file)).map((o) => o.snap.name)
      }
    }
  }

  private emit(): void {
    this.scheduleSave()
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      if (this.web && !this.web.isDestroyed()) {
        this.web.send(IPC.agentsUpdated, this.list(), this.pendingApprovals())
      }
    }, 60)
  }

  // ---------- persistence: agents survive a restart as paused ----------

  private get storeFile(): string {
    return join(app.getPath('userData'), 'agents.json')
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveNow()
    }, 1000)
  }

  private saveNow(): void {
    const data: SavedAgent[] = [...this.agents.values()].map((a) => ({
      snap: a.snap,
      repo: a.repo,
      base: a.base,
      sessionId: a.sessionId
    }))
    try {
      writeFileSync(this.storeFile, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }

  private load(): void {
    try {
      const data = JSON.parse(readFileSync(this.storeFile, 'utf8')) as SavedAgent[]
      for (const s of data) {
        if (!existsSync(s.snap.folder)) continue
        const wasActive = s.snap.status === 'working' || s.snap.status === 'waiting' || s.snap.status === 'starting'
        if (wasActive) {
          s.snap.status = 'paused'
          s.snap.statusText = 'Paused when Murmur closed'
        }
        this.agents.set(s.snap.id, { snap: s.snap, repo: s.repo, base: s.base, sessionId: s.sessionId })
      }
    } catch {
      /* first run */
    }
  }
}

// ---------- helpers ----------

function modeLabel(mode: AccessMode): string {
  return { ask: 'Ask before every action', edits: 'Let it edit files', auto: 'Auto', bypass: 'Skip all checks' }[mode]
}

function friendlyError(message: string): string {
  if (/auth|login|api key|401|credential/i.test(message)) return 'Not signed in to Claude. Run "claude" in a terminal and log in.'
  if (/ENOENT|not found|spawn/i.test(message)) return 'Couldn\'t start Claude Code on this computer.'
  return 'Stopped with an error'
}

interface Described {
  kind: ActivityItem['kind']
  doing: string
  done: string
  ask: string
}

function describe(tool: string, input: Record<string, unknown>, folder: string): Described {
  const file = (key = 'file_path'): string => {
    const p = String(input[key] ?? input.path ?? '')
    if (!p) return 'a file'
    const rel = relative(folder, p)
    return rel && !rel.startsWith('..') && rel.length < 48 ? rel.replace(/\\/g, '/') : basename(p)
  }
  const clip = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  switch (tool) {
    case 'Read':
      return { kind: 'read', doing: `Reading ${file()}`, done: `Read ${file()}`, ask: `read ${file()}` }
    case 'Write':
      return { kind: 'edit', doing: `Writing ${file()}`, done: `Wrote ${file()}`, ask: `write ${file()}` }
    case 'Edit':
    case 'MultiEdit':
      return { kind: 'edit', doing: `Editing ${file()}`, done: `Edited ${file()}`, ask: `edit ${file()}` }
    case 'NotebookEdit':
      return { kind: 'edit', doing: `Editing ${file('notebook_path')}`, done: `Edited ${file('notebook_path')}`, ask: `edit ${file('notebook_path')}` }
    case 'Bash':
    case 'PowerShell': {
      const cmd = clip(String(input.command ?? '').split('\n')[0])
      return { kind: 'run', doing: `Running ${cmd}`, done: `Ran ${cmd}`, ask: `run a command` }
    }
    case 'Grep':
    case 'Glob':
      return { kind: 'search', doing: 'Searching the code', done: `Searched for ${clip(String(input.pattern ?? ''), 40)}`, ask: 'search the code' }
    case 'WebSearch':
      return { kind: 'search', doing: 'Searching the web', done: `Searched the web for ${clip(String(input.query ?? ''), 40)}`, ask: 'search the web' }
    case 'WebFetch':
      return { kind: 'search', doing: 'Reading a web page', done: `Read ${clip(String(input.url ?? ''), 50)}`, ask: `open ${clip(String(input.url ?? 'a web page'), 50)}` }
    case 'TodoWrite':
      return { kind: 'other', doing: 'Planning its steps', done: 'Updated its to-do list', ask: 'update its to-do list' }
    case 'Task':
    case 'Agent':
      return { kind: 'other', doing: 'Working with a helper', done: 'Started a helper agent', ask: 'start a helper agent' }
    default:
      return { kind: 'other', doing: `Using ${tool}`, done: `Used ${tool}`, ask: `use ${tool}` }
  }
}
