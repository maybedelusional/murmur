// A stand-in for the Electron bridge so the UI can be opened in a plain
// browser while designing (`npm run dev`, then open the renderer URL).
// Never used inside the real app.
import type { AgentMessageEvent, AgentSnapshot, ApprovalRequest, Marketplace, MurmurApi, NowPlaying, PluginsState, Settings } from '@shared/types'

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
    mk({ name: 'Planner', role: 'planner', status: 'idle', statusText: 'Done, waiting for you', mode: 'ask', task: 'Plan the session work into parallel tasks.' }),
    mk({
      name: 'Builder A',
      role: 'builder',
      status: 'working',
      statusText: 'Editing src/auth/session.ts',
      mode: 'auto',
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
    mk({ name: 'Builder B', role: 'builder', status: 'working', statusText: 'Running npm test', mode: 'auto', task: 'Rate-limit the login route.' }),
    mk({ name: 'Reviewer', role: 'reviewer', status: 'waiting', statusText: 'Waiting for you', mode: 'ask', task: 'Review the builders\u2019 branches.' }),
    mk({ name: 'Tester', role: 'tester', status: 'working', statusText: 'Writing end-to-end tests', mode: 'edits', task: 'Test an expired session.' })
  ]
  let approvals: ApprovalRequest[] = [
    { id: 'ap1', agentId: 'reviewer', title: 'Reviewer wants to run a command', detail: 'git diff main...murmur/builder-a-k3f9', toolName: 'Bash', at: now }
  ]
  let settings: Settings = { worktreeRoot: 'C:\\cw', allowBypass: false, hideAutoCaution: false, theme: 'dusk' }
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
