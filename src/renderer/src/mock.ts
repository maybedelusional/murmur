// A stand-in for the Electron bridge so the UI can be opened in a plain
// browser while designing (`npm run dev`, then open the renderer URL).
// Never used inside the real app.
import type { AgentMessageEvent, AgentSnapshot, ApprovalRequest, FileDiff, Marketplace, MurmurApi, NowPlaying, PluginsState, Recipe, Settings, ThemeInfo } from '@shared/types'
import { BUILTIN_RECIPES } from '@shared/recipes'
import { DUSK, NIGHT } from '@shared/themes'

export function installMock(): void {
  const now = Date.now()
  const mk = (p: Partial<AgentSnapshot> & Pick<AgentSnapshot, 'name' | 'role' | 'status' | 'statusText' | 'mode'>): AgentSnapshot => ({
    id: p.name.toLowerCase().replace(/\s/g, '-'),
    task: 'Add refresh-token rotation to the session endpoint.',
    branch: `murmur/${p.name.toLowerCase().replace(/\s/g, '-')}-k3f9`,
    folder: `C:\\cw\\acme-web\\${p.name.toLowerCase().replace(/\s/g, '-')}`,
    activity: [],
    files: [],
    linesAdded: 0,
    linesRemoved: 0,
    costUsd: 0,
    createdAt: now,
    ...p
  })
  let agents: AgentSnapshot[] = [
    mk({ name: 'Planner', role: 'planner', status: 'idle', statusText: 'Done, waiting for you', mode: 'edits', task: 'Plan the session work into parallel tasks.', costUsd: 0.62, teamId: 't1', teamName: 'Plan, build and review', canStartAgents: true }),
    mk({
      name: 'Builder A',
      role: 'builder',
      status: 'working',
      statusText: 'Editing src/auth/session.ts',
      mode: 'auto',
      costUsd: 1.84,
      budgetUsd: 5,
      teamId: 't1',
      teamName: 'Plan, build and review',
      startedBy: 'Planner',
      linesAdded: 184,
      linesRemoved: 37,
      files: [
        { file: 'src/auth/session.ts', added: 92, removed: 30, sharedWith: ['Builder B'] },
        { file: 'src/auth/rotate.ts', added: 71, removed: 0, sharedWith: [] },
        { file: 'src/routes/login.ts', added: 12, removed: 7, sharedWith: [] },
        { file: 'test/auth.spec.ts', added: 9, removed: 0, sharedWith: [] }
      ],
      activity: [
        { at: now - 240000, kind: 'read', text: 'Read src/auth/session.ts' },
        { at: now - 180000, kind: 'edit', text: 'Edited src/auth/session.ts' },
        { at: now - 170000, kind: 'edit', text: 'Wrote src/auth/rotate.ts' },
        { at: now - 90000, kind: 'run', text: 'Ran npm test -- auth' },
        { at: now - 60000, kind: 'say', text: 'All 12 auth tests pass. Next I will handle the expired-token path.' }
      ]
    }),
    mk({ name: 'Builder B', role: 'builder', status: 'working', statusText: 'Running npm test', mode: 'auto', task: 'Rate-limit the login route.', costUsd: 1.21, budgetUsd: 5, teamId: 't1', teamName: 'Plan, build and review', startedBy: 'Planner' }),
    mk({ name: 'Reviewer', role: 'reviewer', status: 'waiting', statusText: 'Waiting for you', mode: 'ask', task: 'Review the builders\u2019 branches.', costUsd: 0.4, teamId: 't1', teamName: 'Plan, build and review' }),
    mk({ name: 'Tester', role: 'tester', status: 'idle', statusText: 'Reached its $2.00 budget', mode: 'edits', task: 'Test an expired session.', costUsd: 2.0, budgetUsd: 2, overBudget: true })
  ]
  let approvals: ApprovalRequest[] = [
    { id: 'ap1', agentId: 'reviewer', title: 'Reviewer wants to run a command', detail: 'git diff main...murmur/builder-a-k3f9', toolName: 'Bash', at: now }
  ]
  let settings: Settings = {
    worktreeRoot: 'C:\\cw',
    allowBypass: false,
    hideAutoCaution: false,
    theme: 'dusk',
    defaultBudgetUsd: 5,
    notifyApprovals: true,
    notifyFinished: true,
    notifyErrors: true
  }
  let themes: ThemeInfo[] = [
    { id: 'dusk', name: 'Dusk', source: 'builtin', tokens: DUSK, bands: true },
    { id: 'night', name: 'Night', source: 'builtin', tokens: NIGHT, bands: true },
    { id: 'plugin.murmur-themes.fjord', name: 'Fjord', source: 'plugin', pluginName: 'murmur-themes', tokens: { ...DUSK, skyHigh: '#7E93A6', sky: '#93A5B5', skyLow: '#B4C0C9', horizon: '#D9C7A8' }, bands: true }
  ]
  const themeListeners = new Set<(t: ThemeInfo[], c: ThemeInfo) => void>()
  let recipes: Recipe[] = [...BUILTIN_RECIPES]
  const none: import('@shared/types').PluginContents = { skills: [], commands: [], agents: [], hooks: false, mcpServers: [] }
  const market = (key: string, repo: string, name: string, official: boolean, list: Array<[string, string, Partial<typeof none> | null, string?]>, path?: string): Marketplace => ({
    key,
    repo,
    path,
    name,
    official,
    builtin: true,
    loading: false,
    refreshedAt: now - 3600000,
    plugins: list.map(([n, d, c, from]) => ({
      key: `${key}/${n}`,
      name: n,
      marketplaceKey: key,
      description: d,
      from: from ?? `github.com/${repo}`,
      supported: true,
      contents: c ? { ...none, ...c } : undefined
    }))
  })
  let plugins: PluginsState = {
    busy: [],
    installed: [],
    mySkills: [{ name: 'write-release-notes', description: 'Use when writing release notes for a new version.', body: '# Release notes\n\n1. Read the commits since the last tag.\n2. Group them into Added, Changed and Fixed.' }],
    marketplaces: [
      market('anthropics/claude-plugins-official', 'anthropics/claude-plugins-official', 'claude-plugins-official', true, [
        ['commit-commands', 'Commands for git commit workflows including commit, push, and PR creation', { commands: ['clean_gone', 'commit-push-pr', 'commit'] }],
        ['code-review', 'Automated code review for pull requests using several specialised agents', { commands: ['code-review'], agents: ['reviewer'] }],
        ['feature-dev', 'A structured feature development workflow with agents for exploring, designing and reviewing', { commands: ['feature-dev'], agents: ['code-explorer', 'code-architect', 'code-reviewer'] }],
        ['security-guidance', 'Warns about risky patterns when editing files', { hooks: true }],
        ['api-security-testing', 'Audit and scan OpenAPI definitions', null, 'github.com/42Crunch-AI/claude-plugins (plugins/api-security-testing)']
      ]),
      market('anthropics/skills', 'anthropics/skills', 'anthropic-agent-skills', true, [
        ['document-skills', 'Collection of document processing suite including Excel, Word, PowerPoint, and PDF capabilities', { skills: ['xlsx', 'docx', 'pptx', 'pdf'] }],
        ['claude-api', 'Claude API and SDK documentation skill for building LLM-powered applications', { skills: ['claude-api'] }]
      ]),
      market('maybedelusional/murmur/marketplace', 'maybedelusional/murmur', 'murmur-community', false, [
        ['murmur-teamwork', 'Skills that help agents hand work to each other cleanly: handoff notes and review requests.', { skills: ['handoff', 'review-request'] }]
      ], 'marketplace')
    ]
  }
  const pluginListeners = new Set<(s: PluginsState) => void>()
  const listeners = new Set<(a: AgentSnapshot[], p: ApprovalRequest[]) => void>()
  const push = (): void => listeners.forEach((l) => l(agents, approvals))
  const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
  const playing: NowPlaying = { available: true, title: 'Low Tide', artist: 'Halden Fields', playing: true }

  const api: MurmurApi = {
    platform: 'win32',
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    project: {
      current: () => Promise.resolve({ path: 'C:\\code\\acme-web', name: 'acme-web', branch: 'main' }),
      choose: () => ok(null)
    },
    agents: {
      list: () => Promise.resolve(agents),
      create: (input) => {
        const a = mk({ name: `${input.role[0].toUpperCase()}${input.role.slice(1)} ${agents.length}`, role: input.role, status: 'starting', statusText: 'Starting', mode: input.mode, task: input.task })
        agents = [...agents, a]
        setTimeout(() => {
          agents = agents.map((x) => (x.id === a.id ? { ...x, status: 'working', statusText: 'Reading the code' } : x))
          push()
        }, 1500)
        push()
        return ok(a)
      },
      send: () => ok(undefined),
      pause: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'paused', statusText: 'Paused' } : x))
        push()
        return ok(undefined)
      },
      resume: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'working', statusText: 'Thinking' } : x))
        push()
        return ok(undefined)
      },
      pauseAll: () => {
        agents = agents.map((x) => (x.status === 'working' ? { ...x, status: 'paused', statusText: 'Paused' } : x))
        push()
        return ok(undefined)
      },
      setMode: (id, mode) => {
        agents = agents.map((x) => (x.id === id ? { ...x, mode } : x))
        push()
        return ok(undefined)
      },
      merge: (id) => {
        agents = agents.map((x) => (x.id === id ? { ...x, status: 'merged', statusText: 'Merged into main' } : x))
        push()
        return ok('main')
      },
      discard: (id) => {
        agents = agents.filter((x) => x.id !== id)
        push()
        return ok(undefined)
      },
      openTerminal: () => ok(undefined),
      answer: (approvalId) => {
        approvals = approvals.filter((p) => p.id !== approvalId)
        agents = agents.map((x) => (x.status === 'waiting' ? { ...x, status: 'working', statusText: 'Reviewing builder-a' } : x))
        push()
        return ok(undefined)
      },
      onUpdate: (cb) => {
        listeners.add(cb)
        setTimeout(() => cb(agents, approvals), 0)
        return () => listeners.delete(cb)
      },
      onFocus: () => () => undefined,
      setBudget: (id, budgetUsd) => {
        agents = agents.map((x) => (x.id === id ? { ...x, budgetUsd: budgetUsd ?? undefined, overBudget: false } : x))
        push()
        return ok(undefined)
      },
      diff: () => ok(sampleDiff()),
      startTeam: () => ok([]),
      onMessage: (cb: (m: AgentMessageEvent) => void) => {
        const pairs = [['builder-a', 'reviewer'], ['planner', 'builder-b'], ['tester', 'builder-a']]
        let i = 0
        const t = setInterval(() => {
          const [fromId, toId] = pairs[i++ % pairs.length]
          cb({ fromId, toId, text: 'Branch is ready for review.', at: Date.now() })
        }, 3500)
        return () => clearInterval(t)
      }
    },
    plugins: {
      state: () => Promise.resolve(plugins),
      refresh: () => ok(undefined),
      install: (key) => {
        const p = plugins.marketplaces.flatMap((m) => m.plugins).find((x) => x.key === key)!
        plugins = {
          ...plugins,
          installed: [
            ...plugins.installed,
            { key, name: p.name, marketplaceKey: p.marketplaceKey, marketplaceName: 'claude-plugins-official', enabled: true, installedAt: Date.now(), contents: p.contents ?? { skills: [], commands: [], agents: [], hooks: false, mcpServers: [] } }
          ]
        }
        pluginListeners.forEach((l) => l(plugins))
        return ok({ enabled: true, runsCode: false })
      },
      update: () => ok(undefined),
      uninstall: (key) => {
        plugins = { ...plugins, installed: plugins.installed.filter((p) => p.key !== key) }
        pluginListeners.forEach((l) => l(plugins))
        return ok(undefined)
      },
      setEnabled: (key, enabled) => {
        plugins = { ...plugins, installed: plugins.installed.map((p) => (p.key === key ? { ...p, enabled } : p)) }
        pluginListeners.forEach((l) => l(plugins))
        return ok(undefined)
      },
      addMarketplace: () => ok(undefined),
      removeMarketplace: () => ok(undefined),
      saveSkill: (skill) => {
        plugins = { ...plugins, mySkills: [...plugins.mySkills.filter((s) => s.name !== skill.name), skill] }
        pluginListeners.forEach((l) => l(plugins))
        return ok(undefined)
      },
      deleteSkill: () => ok(undefined),
      onChange: (cb) => {
        pluginListeners.add(cb)
        return () => pluginListeners.delete(cb)
      }
    },
    recipes: {
      list: () => Promise.resolve(recipes),
      save: (r) => {
        const saved = { ...r, id: r.id && !r.builtin ? r.id : `r${Date.now()}`, builtin: false }
        recipes = [...recipes.filter((x) => x.id !== saved.id), saved]
        return ok(saved)
      },
      remove: (id) => {
        recipes = recipes.filter((x) => x.id !== id)
        return ok(undefined)
      }
    },
    themes: {
      list: () => Promise.resolve(themes),
      use: (id) => {
        settings = { ...settings, theme: id }
        const t = themes.find((x) => x.id === id)!
        themeListeners.forEach((l) => l(themes, t))
        return ok(t)
      },
      save: (d) => {
        const t: ThemeInfo = { id: d.id ?? `mine.${d.name.toLowerCase()}`, name: d.name, source: 'mine', tokens: d.tokens, bands: d.bands }
        themes = [...themes.filter((x) => x.id !== t.id), t]
        return ok(t)
      },
      remove: () => ok(undefined),
      chooseBackground: () => Promise.resolve(null),
      onChange: (cb) => {
        themeListeners.add(cb)
        return () => themeListeners.delete(cb)
      }
    },
    settings: {
      get: () => Promise.resolve(settings),
      set: (patch) => {
        settings = { ...settings, ...patch }
        return Promise.resolve(settings)
      }
    },
    media: {
      onChange: (cb) => {
        setTimeout(() => cb(playing), 0)
        return () => undefined
      },
      command: () => Promise.resolve()
    },
    updates: { onChange: () => () => undefined, restartToUpdate() {} }
  }
  window.murmur = api
}

function sampleDiff(): FileDiff[] {
  return [
    {
      file: 'src/auth/session.ts',
      status: 'modified',
      binary: false,
      tooLarge: false,
      added: 6,
      removed: 2,
      hunks: [
        {
          header: '@@ -12,8 +12,12 @@ export async function refresh(req: Request) {',
          lines: [
            { kind: 'context', oldNo: 12, newNo: 12, text: '  const token = req.cookies.refresh' },
            { kind: 'context', oldNo: 13, newNo: 13, text: '  if (!token) throw new AuthError(\'missing refresh token\')' },
            { kind: 'del', oldNo: 14, text: '  const session = await sessions.find(token)' },
            { kind: 'del', oldNo: 15, text: '  return issue(session.userId)' },
            { kind: 'add', newNo: 14, text: '  const session = await sessions.find(token)' },
            { kind: 'add', newNo: 15, text: '  if (!session || session.revoked) throw new AuthError(\'session expired\')' },
            { kind: 'add', newNo: 16, text: '  // Rotate: the old token stops working the moment a new one is issued.' },
            { kind: 'add', newNo: 17, text: '  await sessions.revoke(token)' },
            { kind: 'add', newNo: 18, text: '  const next = await rotate(session)' },
            { kind: 'add', newNo: 19, text: '  return issue(session.userId, next)' },
            { kind: 'context', oldNo: 16, newNo: 20, text: '}' }
          ]
        }
      ]
    },
    {
      file: 'src/auth/rotate.ts',
      status: 'added',
      binary: false,
      tooLarge: false,
      added: 4,
      removed: 0,
      hunks: [
        {
          header: '@@ -0,0 +1,4 @@',
          lines: [
            { kind: 'add', newNo: 1, text: "import { randomBytes } from 'node:crypto'" },
            { kind: 'add', newNo: 2, text: '' },
            { kind: 'add', newNo: 3, text: 'export const rotate = async (s: Session) =>' },
            { kind: 'add', newNo: 4, text: "  sessions.create(s.userId, randomBytes(32).toString('hex'))" }
          ]
        }
      ]
    }
  ]
}
